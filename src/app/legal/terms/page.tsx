import Link from 'next/link';

export const metadata = { title: 'Terms of Service | Stokora WMS' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-primary hover:underline">&larr; Back to Stokora WMS</Link>
        <h1 className="text-3xl font-bold mt-6 mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Service Description</h2>
            <p>Stokora WMS is a cloud-based warehouse management system providing inventory tracking, order management, point of sale, shipping integration, and related business tools (&quot;the Service&quot;).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Account Terms</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must provide accurate and complete registration information</li>
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You are responsible for all activity that occurs under your account</li>
              <li>You must be at least 18 years old to use this Service</li>
              <li>One person or legal entity may maintain no more than one free account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Subscription & Payment</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Paid plans are billed monthly via Stripe</li>
              <li>You may cancel your subscription at any time — access continues through the end of the billing period</li>
              <li>Refunds are handled on a case-by-case basis</li>
              <li>We reserve the right to change pricing with 30 days notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data Ownership</h2>
            <p><strong>You own your data.</strong> All products, orders, customers, inventory records, and other business data you enter into Stokora belongs to you. We claim no intellectual property rights over your content.</p>
            <p>You may export your data at any time via the Data Export feature in Settings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Reverse engineer, decompile, or disassemble the Service</li>
              <li>Resell or redistribute the Service without written permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Service Availability</h2>
            <p>We strive for 99.9% uptime but do not guarantee uninterrupted access. The Service depends on third-party infrastructure (Vercel, Supabase, Stripe) and their availability. We are not liable for downtime caused by third-party providers, scheduled maintenance, or force majeure events.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Stokora WMS and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly. Our total liability for any claim arising from the Service shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Termination</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You may terminate your account at any time by contacting support</li>
              <li>We may terminate accounts that violate these terms with notice</li>
              <li>Upon termination, your data will be retained for 30 days, then deleted</li>
              <li>You may request a data export before termination</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Governing Law</h2>
            <p>These terms are governed by the laws of the State of Virginia, United States, without regard to conflict of law provisions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Changes</h2>
            <p>We may update these terms from time to time. Material changes will be communicated via email at least 30 days before taking effect. Continued use of the Service after changes take effect constitutes acceptance of the new terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Contact</h2>
            <p>Questions about these terms: <strong>support@stokora.com</strong></p>
          </section>
        </div>
      </div>
    </div>
  );
}
