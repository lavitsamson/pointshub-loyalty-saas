'use client';

import {
  type InvitationPreview,
  PASSWORD_MIN_LENGTH,
  PasswordSchema,
  PersonNameSchema,
} from '@pointshub/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Alert, LoadingRows } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAcceptInvitation, useInvitationPreview } from '@/lib/api/auth';
import { errorMessage, isApiError } from '@/lib/api/client';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { homeFor } from '@/lib/navigation';

const NewAccountSchema = z.object({ name: PersonNameSchema, password: PasswordSchema });
const ExistingAccountSchema = z.object({ password: z.string().min(1, 'Enter your password') });

export function AcceptInvitation({ token }: { token: string }) {
  const preview = useInvitationPreview(token);

  if (preview.isPending) {
    return (
      <AuthCard title="Checking your invitation…">
        <LoadingRows rows={3} label="Checking invitation" />
      </AuthCard>
    );
  }
  if (preview.isError) {
    return (
      <AuthCard
        title={
          isApiError(preview.error, 410) ? 'Invitation no longer valid' : 'Something went wrong'
        }
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        }
      >
        <Alert variant="destructive">{errorMessage(preview.error)}</Alert>
      </AuthCard>
    );
  }
  return <AcceptForm token={token} invitation={preview.data} />;
}

function AcceptForm({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const router = useRouter();
  const accept = useAcceptInvitation(token);
  const form = useForm({
    resolver: zodResolver<{ name?: string; password: string }, { name?: string; password: string }>(
      invitation.hasAccount ? ExistingAccountSchema : NewAccountSchema,
    ),
    defaultValues: { name: '', password: '' },
  });
  const { errors } = form.formState;
  const role = invitation.role === 'ADMIN' ? 'an admin' : 'a staff member';

  return (
    <AuthCard
      title={`Join ${invitation.tenantName}`}
      description={
        <>
          You have been invited as {role}. Invitation for <strong>{invitation.email}</strong>.
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((input) =>
          accept.mutate(input, {
            onSuccess: (me) => router.replace(homeFor(me)),
            onError: (error) => applyServerErrors(form, error),
          }),
        )}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormError error={accept.error} />
        {invitation.hasAccount ? (
          <p className="text-sm text-muted-foreground">
            You already have a PointsHub account. Enter its password to add this business to it.
          </p>
        ) : (
          <Field id="name" label="Your name" error={errors.name?.message}>
            <Input
              autoComplete="name"
              {...describedBy('name', errors.name?.message)}
              {...form.register('name')}
            />
          </Field>
        )}
        <Field
          id="password"
          label={invitation.hasAccount ? 'Password' : 'Choose a password'}
          error={errors.password?.message}
          hint={invitation.hasAccount ? undefined : `At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          <Input
            type="password"
            autoComplete={invitation.hasAccount ? 'current-password' : 'new-password'}
            {...describedBy('password', errors.password?.message, !invitation.hasAccount)}
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" disabled={accept.isPending}>
          {accept.isPending ? 'Joining…' : `Join ${invitation.tenantName}`}
        </Button>
      </form>
    </AuthCard>
  );
}
