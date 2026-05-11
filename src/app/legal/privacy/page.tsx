import Link from 'next/link';

export const metadata = { title: 'Privacy Policy | Stokora WMS' };

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-primary hover:underline">&larr; Back to Stokora WMS</Link>
        <h1 className="text-3xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Information We Collect</h2>
            <p>Stokora WMS collects the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account Information:</strong> Name, email address, company name, password (hashed)</li>
              <li><strong>Business Data:</strong> Products, inventory levels, orders, customers, suppliers, work orders, and related operational data you enter into the system</li>
              <li><strong>Shopify Data:</strong> When you connect a Shopify store, we access products, orders, customers, and inventory levels via the Shopify Admin API</li>
              <li><strong>Payment Information:</strong> Processed by Stripe — we do not store credit card numbers</li>
              <li><strong>Usage Data:</strong> Page views, feature usage via Vercel Analytics (anonymized)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide and operate the warehouse management service</li>
              <li>Sync inventory and orders with connected platforms (Shopify)</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send transactional emails (purchase orders to vendors, password resets, notifications)</li>
              <li>Improve the service and fix bugs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Data Storage & Security</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Data is stored in Supabase (PostgreSQL) with Row-Level Security (RLS) enforcing tenant isolation</li>
              <li>All data is encrypted in transit (TLS) and at rest</li>
              <li>Shopify access tokens are encrypted with AES-256-GCM before storage</li>
              <li>Application hosted on Vercel with enterprise-grade infrastructure</li>
              <li>Security headers: CSP, HSTS, X-Frame-Options, Permissions-Policy</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account data is retained while your subscription is active</li>
              <li>Upon Shopify app uninstall: data retained for 48 hours, then anonymized per Shopify GDPR requirements</li>
              <li>Upon account deletion request: PII is anonymized, financial records retained for legal compliance</li>
              <li>Audit trail and stock movement records are immutable for traceability</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Your Rights (GDPR & CCPA)</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access:</strong> Request a copy of all data we hold about you</li>
              <li><strong>Rectification:</strong> Correct inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data</li>
              <li><strong>Portability:</strong> Export your data as CSV files via Settings</li>
              <li><strong>Opt-out:</strong> California residents may opt out of data selling (we do not sell data)</li>
            </ul>
            <p>To exercise these rights, email <strong>privacy@stokora.com</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Sub-Processors</h2>
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b"><th className="text-left py-2">Service</th><th className="text-left py-2">Purpose</th><th className="text-left py-2">Location</th></tr></thead>
              <tbody>
                <tr className="border-b"><td className="py-2">Supabase</td><td>Database & authentication</td><td>US (AWS)</td></tr>
                <tr className="border-b"><td className="py-2">Vercel</td><td>Hosting & analytics</td><td>US (AWS/Edge)</td></tr>
                <tr className="border-b"><td className="py-2">Stripe</td><td>Payment processing</td><td>US</td></tr>
                <tr className="border-b"><td className="py-2">Resend</td><td>Transactional email</td><td>US</td></tr>
                <tr className="border-b"><td className="py-2">EasyPost</td><td>Shipping labels & tracking</td><td>US</td></tr>
                <tr className="border-b"><td className="py-2">Sentry</td><td>Error monitoring</td><td>US</td></tr>
                <tr><td className="py-2">Shopify</td><td>E-commerce integration</td><td>Canada/US</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Cookies</h2>
            <p>We use essential cookies for authentication (Supabase session tokens). We do not use advertising or third-party tracking cookies. Vercel Analytics is cookieless and privacy-compliant.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Contact</h2>
            <p>For privacy-related questions or data requests:</p>
            <p>Email: <strong>privacy@stokora.com</strong></p>
          </section>
        </div>
      </div>
    </div>
  );
}
