import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { name, email, company, message, interest } = await request.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 });
    }

    const adminEmail = process.env.CONTACT_EMAIL || 'mendozaarmytransition@gmail.com';

    // Send via Resend if configured
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Stokora WMS <notifications@${process.env.NEXT_PUBLIC_APP_DOMAIN || 'stokora.com'}>`,
          to: adminEmail,
          subject: `New Inquiry from ${name}${company ? ` (${company})` : ''}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px">
              <h2 style="color:#1a2744">New Stokora WMS Inquiry</h2>
              <table style="width:100%;font-size:14px;margin:16px 0">
                <tr><td style="padding:6px 0;color:#64748b;width:100px"><strong>Name:</strong></td><td>${name}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b"><strong>Email:</strong></td><td><a href="mailto:${email}">${email}</a></td></tr>
                ${company ? `<tr><td style="padding:6px 0;color:#64748b"><strong>Company:</strong></td><td>${company}</td></tr>` : ''}
                ${interest ? `<tr><td style="padding:6px 0;color:#64748b"><strong>Interest:</strong></td><td>${interest}</td></tr>` : ''}
              </table>
              <div style="background:#f8fafc;padding:16px;border-radius:8px;font-size:14px;margin:16px 0">
                <strong>Message:</strong><br><br>
                ${message.replace(/\n/g, '<br>')}
              </div>
              <p style="font-size:12px;color:#94a3b8;margin-top:24px">Sent from the Stokora WMS demo page</p>
            </div>
          `,
          reply_to: email,
        }),
      });
    }

    // Also log to console for dev/fallback
    console.log('Contact form submission:', { name, email, company, interest, message });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
