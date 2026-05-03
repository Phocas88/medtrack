'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: '#64748b', marginBottom: '1rem' }}>
            {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred'}
          </p>
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: '14px' }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
