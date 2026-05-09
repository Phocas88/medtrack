'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { StokoraLogo } from '@/components/ui/stokora-logo';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCallback = searchParams.get('type') === 'recovery';

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [changed, setChanged] = useState(false);

  // Step 1: Request reset link
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset?type=recovery`,
    });

    setLoading(false);
    if (resetErr) {
      setError(resetErr.message);
    } else {
      setSent(true);
    }
  };

  // Step 2: Set new password (after clicking email link)
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });

    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
    } else {
      setChanged(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2"><StokoraLogo theme="light" /></div>

          {sent ? (
            <>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Check Your Email</CardTitle>
              <CardDescription>
                We sent a password reset link to <strong>{email}</strong>. Click the link to set a new password.
              </CardDescription>
            </>
          ) : changed ? (
            <>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Password Changed</CardTitle>
              <CardDescription>Redirecting to dashboard...</CardDescription>
            </>
          ) : isCallback ? (
            <>
              <CardTitle className="text-xl">Set New Password</CardTitle>
              <CardDescription>Enter your new password below.</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-xl">Reset Password</CardTitle>
              <CardDescription>Enter your email to receive a reset link.</CardDescription>
            </>
          )}
        </CardHeader>

        {!sent && !changed && (
          <form onSubmit={isCallback ? handleSetPassword : handleRequestReset}>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {isCallback ? (
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCallback ? 'Set New Password' : 'Send Reset Link'}
              </Button>
            </CardFooter>
          </form>
        )}

        <CardFooter className="justify-center">
          <Link href="/auth/login" className="text-sm text-primary hover:underline">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
