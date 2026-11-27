'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(200),
  email: z.string().trim().email('Enter a valid work email address.').max(254),
  password: z.string().min(8, 'Use at least 8 characters.').max(72),
  confirmPassword: z.string(),
  companyName: z.string().trim().min(2, 'Enter your company name.').max(200),
  businessPhone: z.string().trim().max(40).refine(value => !value || value.replace(/\D/g, '').length >= 7, 'Enter a valid phone number.'),
  street: z.string().trim().min(1, 'Enter your business street address.').max(150),
  unit: z.string().trim().max(100),
  city: z.string().trim().min(1, 'Enter your city.').max(100),
  region: z.string().trim().max(100),
  postalCode: z.string().trim().max(32),
  country: z.string().trim().min(2, 'Enter your country.').max(100),
}).refine(data => data.password === data.confirmPassword, {
  path: ['confirmPassword'], message: 'The passwords must match.',
});

type SignupFormData = z.infer<typeof signupSchema>;
const accountFields = [
  { name: 'fullName', label: 'Full name', autoComplete: 'name' },
  { name: 'email', label: 'Work email', autoComplete: 'email', type: 'email' },
  { name: 'password', label: 'Password (at least 8 characters)', autoComplete: 'new-password', type: 'password' },
  { name: 'confirmPassword', label: 'Confirm password', autoComplete: 'new-password', type: 'password' },
] as const;
const businessFields = [
  { name: 'companyName', label: 'Company / Organization Name', autoComplete: 'organization' },
  { name: 'businessPhone', label: 'Business phone (optional)', autoComplete: 'tel', type: 'tel' },
  { name: 'street', label: 'Business street address', autoComplete: 'address-line1' },
  { name: 'unit', label: 'Suite or unit (optional)', autoComplete: 'address-line2' },
  { name: 'city', label: 'City', autoComplete: 'address-level2' },
  { name: 'region', label: 'State or province (if applicable)', autoComplete: 'address-level1' },
  { name: 'postalCode', label: 'ZIP or postal code (if applicable)', autoComplete: 'postal-code' },
  { name: 'country', label: 'Country', autoComplete: 'country-name' },
] as const;

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [review, setReview] = useState<SignupFormData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupFormData) {
    if (!review || !confirmed) return;
    setServerError(null);
    const supabase = createClient();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        data: {
          full_name: data.fullName,
          company_name: data.companyName,
          organization_profile: {
            address: [data.street, data.unit, data.city, data.region, data.postalCode, data.country].filter(Boolean).join(', '),
            business_phone: data.businessPhone,
          },
        },
      },
    });

    if (authError) {
      setServerError(authError.message);
      return;
    }

    if (!authData.user) {
      setServerError('Failed to create account. Please try again.');
      return;
    }

    // If email confirmation is required, show a message
    if (authData.session === null) {
      setEmailSent(true);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold text-heading">Check Your Email</CardTitle>
            <CardDescription>
              We sent a confirmation link to your email address. Click the link to
              confirm your email and sign in. Warehouse access opens at launch.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href="/auth/login" className="text-sm font-medium text-primary hover:underline">
              Back to Sign In
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  function fields(items: readonly (typeof accountFields[number] | typeof businessFields[number])[]) {
    return items.map(field => (
      <div key={field.name} className="min-w-0 space-y-2">
        <Label htmlFor={field.name}>{field.label}</Label>
        <Input id={field.name} autoComplete={field.autoComplete}
          type={'type' in field ? field.type : 'text'}
          aria-invalid={!!errors[field.name]}
          aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
          {...register(field.name)} />
        {errors[field.name] && <p id={`${field.name}-error`} className="text-sm text-destructive">{errors[field.name]?.message}</p>}
      </div>
    ));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center"><InvexiqsLogo size="lg" /></div>
          <CardTitle className="text-2xl font-bold text-heading">Create your Invexiqs account</CardTitle>
          <CardDescription>Invexiqs WMS is scheduled to launch in June 2027. We’ll post the exact date closer to launch.</CardDescription>
        </CardHeader>
        <form noValidate onSubmit={handleSubmit(review ? onSubmit : data => {
          setConfirmed(false);
          setServerError(null);
          setReview(data);
        })}>
          <CardContent className="space-y-5">
            {serverError && <p role="alert" className="flex gap-2 rounded-md border border-destructive/50 p-3 text-sm text-destructive">
              <AlertCircle aria-hidden className="size-4 shrink-0" />{serverError}
            </p>}
            {review ? <>
              <h2 ref={reviewHeading} tabIndex={-1} className="text-lg font-semibold">Review your account details</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {[['Full name', review.fullName], ['Work email', review.email], ['Company', review.companyName],
                  ['Business phone', review.businessPhone || 'Not provided'],
                  ['Business address', [review.street, review.unit, review.city, review.region, review.postalCode, review.country].filter(Boolean).join(', ')]].map(([label, value]) => (
                  <div key={label}><dt className="font-medium">{label}</dt><dd className="break-words text-muted-foreground">{value}</dd></div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">Your two password entries match.</p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
                I confirm that my account and business details are correct.
              </label>
            </> : <>
              <p className="text-sm text-muted-foreground">Confirm your email to sign in before launch. Your warehouse workspace will open at launch.</p>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-3 font-semibold">Account details</legend>
                {fields(accountFields)}
              </fieldset>
              <fieldset className="grid gap-4 border-t pt-3 sm:grid-cols-2">
                <legend className="pr-2 font-semibold">Business details</legend>
                {fields(businessFields)}
              </fieldset>
            </>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isSubmitting || (!!review && !confirmed)}>
              {isSubmitting && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
              {review ? 'Confirm and create account' : 'Review details'}
            </Button>
            {review && <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={() => setReview(null)}>Edit details</Button>}
            <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/auth/login" className="font-medium text-primary hover:underline">Sign in</Link></p>
            <Link href="/legal/privacy" className="text-sm text-muted-foreground underline">Privacy Policy</Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
