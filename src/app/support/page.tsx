import Link from 'next/link';
import { publicSupportAddress } from '@/lib/public-site';
import { Mail, FileText, ExternalLink } from 'lucide-react';

export const metadata = { title: 'Support | Invexiqs WMS', description: 'Contact Invexiqs for technical and billing support.', alternates: { canonical: '/support' } };

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-primary hover:underline">&larr; Back to Invexiqs WMS</Link>
        <h1 className="text-3xl font-bold text-heading mt-6 mb-2">Support</h1>
        <p className="text-muted-foreground mb-8">We&apos;re here to help you get the most out of Invexiqs WMS.</p>

        <div className="grid gap-6">
          <div className="rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <Mail className="h-6 w-6 text-primary mt-1 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Contact Support</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  For technical issues, billing questions, or feature requests.
                </p>
                {publicSupportAddress ? (
                  <a href={`mailto:${publicSupportAddress}`} className="mt-2 inline-block font-medium text-primary underline">Email support</a>
                ) : (
                  <Link href="/#contact" className="mt-2 inline-block font-medium text-primary underline">Contact support</Link>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <FileText className="h-6 w-6 text-primary mt-1 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Documentation</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse the Invexiqs user guide.
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
          <p>For privacy-related requests: <Link href="/legal/privacy#privacy-contact" className="text-primary underline">Privacy contact</Link></p>
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
