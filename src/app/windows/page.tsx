import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { InstallInvexiqs } from './install-invexiqs';

export const metadata: Metadata = {
  title: 'Install Invexiqs on Windows',
  description: 'Install the Invexiqs WMS web app on Windows and open your warehouse workspace from the taskbar.',
};

export default function WindowsPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-12 lg:px-8">
        <div className="space-y-4 rounded-2xl bg-brand-lavender p-6 sm:p-9">
          <h1 className="text-4xl font-bold tracking-tight text-brand-deep-plum">Install Invexiqs on Windows</h1>
          <p className="max-w-xl text-brand-muted-gray">Open Invexiqs in its own desktop window with quick access to your warehouse workspace and scanner. The installed web app uses your usual sign-in and needs an internet connection.</p>
          <div className="flex flex-wrap items-center gap-4">
            <InstallInvexiqs />
            <Link href="/auth/login" className="font-semibold text-brand-royal-plum underline">Sign In</Link>
          </div>
        </div>
        <section className="space-y-3" aria-labelledby="edge-install">
          <h2 id="edge-install" className="text-2xl font-semibold text-brand-deep-plum">Install from Microsoft Edge</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open this page in Microsoft Edge on Windows.</li>
            <li>Choose the install icon in the address bar. You can also open the browser menu and look under Apps for the install option.</li>
            <li>Confirm the install, then use the Windows Start menu or pin Invexiqs to the taskbar.</li>
          </ol>
          <a href="https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/ux" className="inline-block font-semibold text-brand-royal-plum underline">Microsoft Edge Installation Help</a>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
