'use client';

import {
  type ForgotPasswordInput,
  ForgotPasswordSchema,
  type LoginInput,
  LoginSchema,
  PASSWORD_MIN_LENGTH,
  PasswordSchema,
  type PortalRegisterInput,
  PortalRegisterSchema,
} from '@pointshub/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/auth-card';
import { DemoInboxNote } from '@/components/auth/demo-inbox-note';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage, isApiError } from '@/lib/api/client';
import {
  usePortalBusiness,
  usePortalForgotPassword,
  usePortalLogin,
  usePortalRegister,
  usePortalSetPassword,
} from '@/lib/api/portal';
import { formatNumber } from '@/lib/format';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { safeNext } from '@/lib/navigation';
import { portalHref, usePortalSlug } from './portal-shell';

/** The seeded demo business; its portal offers a one-click demo login. */
const DEMO = {
  slug: 'bean-and-brew',
  email: 'customer@beanbrew.demo',
  password: 'DemoPass123!',
};

const passwordHint = `At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`;

function PortalLink({ page, children }: { page: string; children: string }) {
  const slug = usePortalSlug();
  return (
    <Link href={portalHref(slug, page)} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

/** "Earn 2 points for every £1" — the programme's pitch on the sign-in pages. */
function useEarnLine(): string | undefined {
  const business = usePortalBusiness(usePortalSlug()).data;
  if (!business) return undefined;
  const symbol = new Intl.NumberFormat('en-GB', { style: 'currency', currency: business.currency })
    .formatToParts(1)
    .find((p) => p.type === 'currency')?.value;
  const points = Number(business.pointsPerCurrencyUnit);
  return `Earn ${formatNumber(points)} ${points === 1 ? 'point' : 'points'} for every ${symbol ?? business.currency}1 you spend.`;
}

export function PortalLoginForm() {
  const slug = usePortalSlug();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const business = usePortalBusiness(slug).data;
  const earnLine = useEarnLine();
  const login = usePortalLogin(slug);
  const form = useForm({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors } = form.formState;

  const submit = (input: LoginInput) =>
    login.mutate(input, { onSuccess: () => router.replace(next ?? portalHref(slug)) });

  const failure = login.error
    ? isApiError(login.error, 429)
      ? `Too many attempts. Try again in ${login.error.problem.retryAfterSeconds ?? 60} seconds.`
      : errorMessage(login.error)
    : null;

  return (
    <AuthCard
      title={business ? `Sign in to ${business.name} rewards` : 'Sign in to your rewards'}
      description={earnLine}
      footer={
        <>
          New here? <PortalLink page="register">Join the rewards programme</PortalLink>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
        {failure && <Alert variant="destructive">{failure}</Alert>}
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            {...describedBy('email', errors.email?.message)}
            {...form.register('email')}
          />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            {...describedBy('password', errors.password?.message)}
            {...form.register('password')}
          />
        </Field>
        <div className="flex justify-end text-sm">
          <PortalLink page="forgot-password">Forgot your password?</PortalLink>
        </div>
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {slug === DEMO.slug && (
        <div className="mt-6 rounded-md border border-dashed p-3 text-sm">
          <p className="font-medium">Try the demo</p>
          <p className="mt-1 text-muted-foreground">
            Chloe is a regular with points to spend. Password <code>{DEMO.password}</code>.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              form.setValue('email', DEMO.email);
              form.setValue('password', DEMO.password);
            }}
          >
            Use demo customer login
          </Button>
        </div>
      )}
    </AuthCard>
  );
}

export function PortalRegisterForm() {
  const slug = usePortalSlug();
  const business = usePortalBusiness(slug).data;
  const earnLine = useEarnLine();
  const register = usePortalRegister(slug);
  const form = useForm({
    resolver: zodResolver(PortalRegisterSchema),
    defaultValues: { name: '', email: '' },
  });
  const { errors } = form.formState;

  const submit = (input: PortalRegisterInput) =>
    register.mutate(input, { onError: (error) => applyServerErrors(form, error) });

  // The same answer whether or not the address is already a member, so this page never
  // reveals who is a customer. The emailed link finishes joining, or claims the account.
  if (register.isSuccess) {
    return (
      <AuthCard
        title="Check your email"
        footer={<PortalLink page="login">Back to sign in</PortalLink>}
      >
        <p className="text-sm">
          We have sent a link to <strong>{register.variables.email}</strong>. Open it to choose your
          password and finish joining. If you already collect points with {business?.name ?? 'us'},
          the same link sets up your existing account. It expires in 60 minutes.
        </p>
        <DemoInboxNote />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={business ? `Join ${business.name} rewards` : 'Join the rewards programme'}
      description={earnLine}
      footer={
        <>
          Already a member? <PortalLink page="login">Sign in</PortalLink>
        </>
      }
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
          hint="We will email you a link to choose your password."
        >
          <Input
            type="email"
            autoComplete="email"
            {...describedBy('email', errors.email?.message, true)}
            {...form.register('email')}
          />
        </Field>
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Sending…' : 'Join'}
        </Button>
      </form>
    </AuthCard>
  );
}
export function PortalForgotPasswordForm() {
  const slug = usePortalSlug();
  const forgot = usePortalForgotPassword(slug);
  const form = useForm({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const error = form.formState.errors.email?.message;
  const back = <PortalLink page="login">Back to sign in</PortalLink>;

  if (forgot.isSuccess) {
    return (
      <AuthCard title="Check your email" footer={back}>
        <p className="text-sm">
          If <strong>{forgot.variables.email}</strong> is a member, we have sent it a link to choose
          a new password. The link works once and expires in 60 minutes.
        </p>
        <DemoInboxNote />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgotten your password?"
      description="Enter your email and we will send you a link to choose a new one. Joined at the counter? This sets up your password too."
      footer={back}
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
          {forgot.isPending ? 'Sending…' : 'Send link'}
        </Button>
      </form>
    </AuthCard>
  );
}

const NewPasswordSchema = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function PortalSetPasswordForm() {
  const slug = usePortalSlug();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const setPassword = usePortalSetPassword(slug);
  const form = useForm({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;
  const back = <PortalLink page="login">Back to sign in</PortalLink>;

  if (!token) {
    return (
      <AuthCard title="Link incomplete" footer={back}>
        <Alert variant="destructive">
          This link is missing its token. Open the link from the email again, or{' '}
          <Link href={portalHref(slug, 'forgot-password')} className="underline">
            request a new one
          </Link>
          .
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose your password" footer={back}>
      <form
        onSubmit={form.handleSubmit(({ password }) =>
          setPassword.mutate(
            { token, password },
            {
              onSuccess: () => router.replace(portalHref(slug)),
              onError: (e) => applyServerErrors(form, e),
            },
          ),
        )}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormError error={setPassword.error} />
        <Field
          id="password"
          label="New password"
          error={errors.password?.message}
          hint={passwordHint}
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
        <Button type="submit" disabled={setPassword.isPending}>
          {setPassword.isPending ? 'Saving…' : 'Save and sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
