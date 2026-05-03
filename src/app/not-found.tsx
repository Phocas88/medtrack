import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4 px-4">
        <p className="text-6xl font-bold text-muted-foreground">404</p>
        <h2 className="text-xl font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
