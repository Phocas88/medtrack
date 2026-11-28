'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallInvexiqs() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed) return <p role="status" className="font-semibold">Invexiqs is installed on this browser.</p>;
  if (!prompt) return null;
  return (
    <button type="button" className="brand-cta px-5 py-3" disabled={installing} onClick={async () => {
      setInstalling(true);
      try {
        const result = await prompt.prompt();
        if (result.outcome === 'accepted') setInstalled(true);
      } catch {
        // The manual browser instructions remain available.
      } finally {
        setPrompt(null);
        setInstalling(false);
      }
    }}>
      {installing ? 'Opening Installer…' : 'Install Invexiqs'}
    </button>
  );
}
