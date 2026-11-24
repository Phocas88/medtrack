import Link from 'next/link';
import { Mail, FileText, ExternalLink } from 'lucide-react';

export const metadata = { title: 'Support | Stokora WMS', description: 'Contact Stokora for technical and billing support.', alternates: { canonical: '/support' } };

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-primary hover:underline">&larr; Back to Stokora WMS</Link>
        <h1 className="text-3xl font-bold mt-6 mb-2">Support</h1>
        <p className="text-muted-foreground mb-8">We&apos;re here to help you get the most out of Stokora WMS.</p>

        <div className="grid gap-6">
          <div className="rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <Mail className="h-6 w-6 text-primary mt-1 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Email Support</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  For technical issues, billing questions, or feature requests.
                </p>
                <a href="mailto:support@stokora.com" className="text-primary font-medium mt-2 inline-block hover:underline">
                  support@stokora.com
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <FileText className="h-6 w-6 text-primary mt-1 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Documentation</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse the Stokora user guide.
                </p>
                <Link href="/guide" className="text-primary font-medium mt-2 inline-block hover:underline">
                  View User Guide &rarr;
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <ExternalLink className="h-6 w-6 text-primary mt-1 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Live Demo</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Try representative warehouse workflows with sample data.
                </p>
                <Link href="/demo" className="text-primary font-medium mt-2 inline-block hover:underline">
                  Launch Demo &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-sm text-muted-foreground">
          <p>For privacy-related requests: <a href="mailto:privacy@stokora.com" className="text-primary hover:underline">privacy@stokora.com</a></p>
          <p className="mt-2">
            <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>
            {' · '}
            <Link href="/legal/terms" className="text-primary hover:underline">Terms of Service</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
