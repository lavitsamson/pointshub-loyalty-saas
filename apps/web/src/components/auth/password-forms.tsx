'use client';

import {
  type ForgotPasswordInput,
  ForgotPasswordSchema,
  PASSWORD_MIN_LENGTH,
  PasswordSchema,
} from '@pointshub/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/auth-card';
import { DemoInboxNote } from '@/components/auth/demo-inbox-note';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useForgotPassword, useResetPassword } from '@/lib/api/auth';
import { applyServerErrors, zodResolver } from '@/lib/forms';

const backToLogin = (
  <Link href="/login" className="font-medium text-primary hover:underline">
    Back to sign in
  </Link>
);

export function ForgotPasswordForm() {
  const forgot = useForgotPassword();
  const form = useForm({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const error = form.formState.errors.email?.message;

  if (forgot.isSuccess) {
    return (
      <AuthCard title="Check your email" footer={backToLogin}>
        <p className="text-sm">
          If an account exists for <strong>{forgot.variables.email}</strong>, we have sent a link to
          reset its password. The link works once and expires in 30 minutes.
        </p>
        <DemoInboxNote />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you sign in with and we will send you a reset link."
      footer={backToLogin}
    >
      <form
        onSubmit={form.handleSubmit((input: ForgotPasswordInput) => forgot.mutate(input))}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormError error={forgot.error} />
        <Field id="email" label="Email" error={error}>
          <Input
            type="email"
            autoComplete="email"
            {...describedBy('email', error)}
            {...form.register('email')}
          />
        </Field>
        <Button type="submit" disabled={forgot.isPending}>
          {forgot.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  );
}

/** A new password typed twice. */
export const NewPasswordSchema = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const reset = useResetPassword();
  const form = useForm({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;

  if (!token) {
    return (
      <AuthCard title="Link incomplete" footer={backToLogin}>
        <Alert variant="destructive">
          This reset link is missing its token. Open the link from the email again, or{' '}
          <Link href="/forgot-password" className="underline">
            request a new one
          </Link>
          .
        </Alert>
      </AuthCard>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthCard title="Password changed" footer={backToLogin}>
        <Alert variant="success">
          Your password has been changed and you have been signed out everywhere. Sign in with your
          new password.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" footer={backToLogin}>
      <form
        onSubmit={form.handleSubmit(({ password }) =>
          reset.mutate({ token, password }, { onError: (e) => applyServerErrors(form, e) }),
        )}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormError error={reset.error} />
        <Field
          id="password"
          label="New password"
          error={errors.password?.message}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          <Input
            type="password"
            autoComplete="new-password"
            {...describedBy('password', errors.password?.message, true)}
            {...form.register('password')}
          />
        </Field>
        <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...describedBy('confirm', errors.confirm?.message)}
            {...form.register('confirm')}
          />
        </Field>
        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </AuthCard>
  );
}
