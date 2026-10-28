'use client';

import { PASSWORD_MIN_LENGTH, type RegisterInput, RegisterSchema } from '@pointshub/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth/auth-card';
import { DemoInboxNote } from '@/components/auth/demo-inbox-note';
import { NewPasswordSchema } from '@/components/auth/password-forms';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useCompleteRegistration, useRegister } from '@/lib/api/auth';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { homeFor } from '@/lib/navigation';

const CURRENCIES = [
  { code: 'GBP', label: 'British pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'US dollar ($)' },
  { code: 'AUD', label: 'Australian dollar (A$)' },
  { code: 'CAD', label: 'Canadian dollar (C$)' },
];

const signInFooter = (
  <>
    Already have an account?{' '}
    <Link href="/login" className="font-medium text-primary hover:underline">
      Sign in
    </Link>
  </>
);

/** Step one of signing up: the details, then a link by email to choose a password. */
export function RegisterForm() {
  const register = useRegister();
  const form = useForm({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: '', email: '', businessName: '', currency: 'GBP' },
  });
  const { errors } = form.formState;

  const submit = (input: RegisterInput) =>
    register.mutate(input, { onError: (error) => applyServerErrors(form, error) });

  if (register.isSuccess) {
    return (
      <AuthCard title="Check your email" footer={signInFooter}>
        <p className="text-sm">
          We have sent a link to <strong>{register.variables.email}</strong>. Open it to choose a
          password and finish setting up {register.variables.businessName}. The link expires in 60
          minutes.
        </p>
        <DemoInboxNote />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your business account"
      description="We set up a loyalty programme with Bronze, Silver and Gold tiers to start you off."
      footer={signInFooter}
    >
      <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
        <FormError error={register.error} />
        <Field id="name" label="Your name" error={errors.name?.message}>
          <Input
            autoComplete="name"
            {...describedBy('name', errors.name?.message)}
            {...form.register('name')}
          />
        </Field>
        <Field
          id="email"
          label="Email"
          error={errors.email?.message}
          hint="We email you a link to confirm it."
        >
          <Input
            type="email"
            autoComplete="email"
            {...describedBy('email', errors.email?.message, true)}
            {...form.register('email')}
          />
        </Field>
        <Field id="businessName" label="Business name" error={errors.businessName?.message}>
          <Input
            autoComplete="organization"
            {...describedBy('businessName', errors.businessName?.message)}
            {...form.register('businessName')}
          />
        </Field>
        <Field id="currency" label="Currency" error={errors.currency?.message}>
          <Select
            {...describedBy('currency', errors.currency?.message)}
            {...form.register('currency')}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Sending…' : 'Continue'}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Step two, from the emailed link: choosing a password creates the account and business. */
export function CompleteRegistrationForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const complete = useCompleteRegistration();
  const form = useForm({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;

  if (!token) {
    return (
      <AuthCard title="Link incomplete" footer={signInFooter}>
        <Alert variant="destructive">
          This link is missing its token. Open the link from the email again, or{' '}
          <Link href="/register" className="underline">
            sign up again
          </Link>
          .
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a password"
      description="This finishes creating your business account."
      footer={signInFooter}
    >
      <form
        onSubmit={form.handleSubmit(({ password }) =>
          complete.mutate(
            { token, password },
            {
              onSuccess: (me) => router.replace(homeFor(me)),
              onError: (error) => applyServerErrors(form, error),
            },
          ),
        )}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormError error={complete.error} />
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
        >
          <Input
            type="password"
            autoComplete="new-password"
            {...describedBy('password', errors.password?.message, true)}
            {...form.register('password')}
          />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...describedBy('confirm', errors.confirm?.message)}
            {...form.register('confirm')}
          />
        </Field>
        <Button type="submit" disabled={complete.isPending}>
          {complete.isPending ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
