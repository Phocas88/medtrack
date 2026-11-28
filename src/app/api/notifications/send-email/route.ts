import { BRAND_COLOR, PRODUCT_NAME } from "@/lib/brand";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/html";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { digestCsv } from "@/lib/analytics-digest";
import { routeError } from "@/lib/server-auth";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase service role environment variables");
  }

  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    // Auth check: require x-api-key header if NOTIFICATION_API_KEY is set
    const apiKey = process.env.NOTIFICATION_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { error: "Notification worker is not configured" },
        { status: 503 },
      );
    if (apiKey) {
      const providedKey = request.headers.get("x-api-key");
      if (providedKey !== apiKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!resend)
      return NextResponse.json(
        { error: "Email delivery is not configured" },
        { status: 503 },
      );
    await enforceRateLimit("notifications-send-email", "worker", 30);
    const supabase = createServiceClient();

    // Get unsent notifications
    const { data: notifications, error: nErr } = await supabase
      .from("notifications")
      .select(
        "id, tenant_id, user_id, notification_type, priority, title, message, created_at, entity_type, entity_id",
      )
      .eq("is_email_sent", false)
      .order("created_at", { ascending: true })
      .limit(100);

    if (nErr) {
      console.error("Failed to fetch notifications:", nErr);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 },
      );
    }

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const notification of notifications ?? []) {
      // If notification targets a specific user, check their email preference
      if (notification.user_id) {
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("email")
          .eq("user_id", notification.user_id)
          .eq("notification_type", notification.notification_type)
          .single();

        // If preference exists and email is off, skip but still mark as "sent"
        // so we don't re-process it
        if (pref && !pref.email) {
          await supabase
            .from("notifications")
            .update({ is_email_sent: true })
            .eq("id", notification.id);
          skippedCount++;
          continue;
        }
      }

      let attachment: { filename: string; content: Buffer } | undefined;
      if (notification.entity_type === 'analytics_digest') {
        const [access, preference, snapshot] = await Promise.all([
          supabase.rpc('suite_workspace_available', { p_tenant: notification.tenant_id, p_product: 'analytics' }),
          supabase.from('analytics_digest_preferences').select('email_delivery,csv_export')
            .eq('tenant_id', notification.tenant_id).eq('user_id', notification.user_id).maybeSingle(),
          supabase.from('analytics_digest_history').select('*').eq('tenant_id', notification.tenant_id)
            .eq('user_id', notification.user_id).eq('export_id', notification.entity_id).maybeSingle(),
        ]);
        if (access.error || preference.error || snapshot.error) { failedCount++; continue; }
        if (!access.data || !preference.data?.email_delivery || !snapshot.data) {
          await supabase.from('notifications').update({ is_email_sent: true }).eq('id', notification.id);
          skippedCount++;
          continue;
        }
        if (snapshot.data.csv_export && preference.data.csv_export) {
          attachment = {
            filename: `invexiqs-exceptions-${snapshot.data.report_date}.csv`,
            content: Buffer.from(digestCsv(snapshot.data)),
          };
        }
      }

      // If notification targets all users (user_id is null), get all tenant users
      // with email enabled for this type
      let recipients: string[] = [];

      if (notification.user_id) {
        // Single user — get their email
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("email,role,access_level")
          .eq("id", notification.user_id)
          .eq("tenant_id", notification.tenant_id)
          .eq("is_active", true)
          .maybeSingle();
        if (userError) { failedCount++; continue; }
        if (user?.email && (notification.entity_type !== 'analytics_digest'
          || (['admin', 'manager'].includes(user.role) && user.access_level !== 'scanner_only'))) {
          recipients = [user.email];
        }
      } else {
        // Broadcast — get all active tenant users who have email enabled (or no preference set)
        const { data: tenantUsers } = await supabase
          .from("users")
          .select("id, email")
          .eq("tenant_id", notification.tenant_id)
          .eq("is_active", true);

        for (const user of tenantUsers ?? []) {
          const { data: pref } = await supabase
            .from("notification_preferences")
            .select("email")
            .eq("user_id", user.id)
            .eq("notification_type", notification.notification_type)
            .single();

          // Send if no preference exists (default) or email is enabled
          if (!pref || pref.email) {
            recipients.push(user.email);
          }
        }
      }

      if (recipients.length === 0) {
        // No recipients — mark as sent to avoid re-processing
        await supabase
          .from("notifications")
          .update({ is_email_sent: true })
          .eq("id", notification.id);
        skippedCount++;
        continue;
      }

      // ── Send emails to recipients ──
      const fromAddress =
        "notifications@" +
        (process.env.NEXT_PUBLIC_APP_DOMAIN || "stokora.com");

      let delivered = true;
      for (const recipientEmail of recipients) {
        if (resend) {
          try {
            const result = await resend.emails.send(
              {
                from: `${PRODUCT_NAME} <${fromAddress}>`,
                to: recipientEmail,
                subject: notification.title,
                attachments: attachment ? [attachment] : undefined,
                html: `<div style="font-family: sans-serif; padding: 20px;">
      <h2 style="color:${BRAND_COLOR}">${escapeHtml(notification.title)}</h2>
      <p>${escapeHtml(notification.message)}</p>
      <p style="color: #666; font-size: 12px;">This is an automated notification from ${PRODUCT_NAME}.</p>
    </div>`,
              },
              {
                idempotencyKey: `notification-${notification.id}-${createHash("sha256").update(recipientEmail).digest("hex").slice(0, 16)}`,
              },
            );
            if (result.error) delivered = false;
          } catch (emailErr) {
            delivered = false;
            console.error(
              `Failed to send email to ${recipientEmail}:`,
              emailErr,
            );
          }
        }
      }

      if (!delivered) {
        failedCount++;
        continue;
      }
      // Mark notification as email sent
      await supabase
        .from("notifications")
        .update({ is_email_sent: true })
        .eq("id", notification.id);

      sentCount++;
    }

    return NextResponse.json(
      {
        success: true,
        sent: sentCount,
        skipped: skippedCount,
        total: (notifications ?? []).length,
        processedAt: new Date().toISOString(),
        provider: "resend",
        failed: failedCount,
      },
      { status: failedCount ? 502 : 200 },
    );
  } catch (err) {
    return routeError(err);
  }
}
