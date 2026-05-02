// ────────────────────────────────────────────────────────────────────────────
// Email Integration (currently in mock mode)
//
// To enable real emails, install resend: npm install resend
// Then uncomment the email sending code below and set RESEND_API_KEY env var.
//
// Alternatively, you can use SendGrid or Nodemailer:
//   - SendGrid: npm install @sendgrid/mail
//   - Nodemailer: npm install nodemailer
//
// See the commented-out Resend integration below for the pattern to follow.
// ────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// import { Resend } from 'resend';
// const resend = new Resend(process.env.RESEND_API_KEY);

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service role environment variables');
  }

  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    // Auth check: require x-api-key header if NOTIFICATION_API_KEY is set
    const apiKey = process.env.NOTIFICATION_API_KEY;
    if (apiKey) {
      const providedKey = request.headers.get('x-api-key');
      if (providedKey !== apiKey) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const supabase = createServiceClient();

    // Get unsent notifications
    const { data: notifications, error: nErr } = await supabase
      .from('notifications')
      .select('id, tenant_id, user_id, notification_type, priority, title, message, created_at')
      .eq('is_email_sent', false)
      .order('created_at', { ascending: true })
      .limit(100);

    if (nErr) {
      console.error('Failed to fetch notifications:', nErr);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const notification of notifications ?? []) {
      // If notification targets a specific user, check their email preference
      if (notification.user_id) {
        const { data: pref } = await supabase
          .from('notification_preferences')
          .select('email')
          .eq('user_id', notification.user_id)
          .eq('notification_type', notification.notification_type)
          .single();

        // If preference exists and email is off, skip but still mark as "sent"
        // so we don't re-process it
        if (pref && !pref.email) {
          await supabase
            .from('notifications')
            .update({ is_email_sent: true })
            .eq('id', notification.id);
          skippedCount++;
          continue;
        }
      }

      // If notification targets all users (user_id is null), get all tenant users
      // with email enabled for this type
      let recipients: string[] = [];

      if (notification.user_id) {
        // Single user — get their email
        const { data: user } = await supabase
          .from('users')
          .select('email')
          .eq('id', notification.user_id)
          .single();
        if (user?.email) {
          recipients = [user.email];
        }
      } else {
        // Broadcast — get all active tenant users who have email enabled (or no preference set)
        const { data: tenantUsers } = await supabase
          .from('users')
          .select('id, email')
          .eq('tenant_id', notification.tenant_id)
          .eq('is_active', true);

        for (const user of tenantUsers ?? []) {
          const { data: pref } = await supabase
            .from('notification_preferences')
            .select('email')
            .eq('user_id', user.id)
            .eq('notification_type', notification.notification_type)
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
          .from('notifications')
          .update({ is_email_sent: true })
          .eq('id', notification.id);
        skippedCount++;
        continue;
      }

      // ── Mock email send (replace with real provider) ──
      const subject = `[TrackFlow] ${notification.title}`;
      const body = notification.message ?? notification.title;

      for (const recipient of recipients) {
        console.log('─── EMAIL (mock) ───');
        console.log(`  To:      ${recipient}`);
        console.log(`  Subject: ${subject}`);
        console.log(`  Body:    ${body}`);
        console.log(`  Priority: ${notification.priority}`);
        console.log('────────────────────');

        // ── Uncomment for Resend integration ──
        // try {
        //   await resend.emails.send({
        //     from: 'TrackFlow <notifications@yourdomain.com>',
        //     to: [recipient],
        //     subject,
        //     html: `
        //       <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        //         <h2 style="color: #1a1a1a;">${notification.title}</h2>
        //         <p style="color: #4a4a4a; line-height: 1.6;">${body}</p>
        //         <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
        //         <p style="color: #999; font-size: 12px;">
        //           This is an automated notification from TrackFlow.
        //           <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">Manage preferences</a>
        //         </p>
        //       </div>
        //     `,
        //   });
        // } catch (emailErr) {
        //   console.error(`Failed to send email to ${recipient}:`, emailErr);
        // }
      }

      // Mark notification as email sent
      await supabase
        .from('notifications')
        .update({ is_email_sent: true })
        .eq('id', notification.id);

      sentCount++;
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      skipped: skippedCount,
      total: (notifications ?? []).length,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Email send error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
