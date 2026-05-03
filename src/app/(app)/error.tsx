'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4 max-w-md px-4">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Please try again or contact support if the issue persists.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>
        )}
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
