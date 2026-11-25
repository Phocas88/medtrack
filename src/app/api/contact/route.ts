import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { name, email, company, message, interest } = await request.json();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Name, email, and message are required' },
        { status: 400 }
      );
    }

    const accessKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
    if (!accessKey) {
      console.error('WEB3FORMS_ACCESS_KEY not configured');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `New Stokora Inquiry from ${name}${company ? ` (${company})` : ''}`,
        from_name: 'Stokora Demo Site',
        replyto: email,
        name,
        email,
        company: company || 'Not provided',
        interest: interest || 'Not specified',
        message,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Web3Forms error:', errText);
      return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
    }


    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
