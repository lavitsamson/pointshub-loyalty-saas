'use client';

import { type LoginInput, LoginSchema } from '@pointshub/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useLogin } from '@/lib/api/auth';
import { errorMessage, isApiError } from '@/lib/api/client';
import { zodResolver } from '@/lib/forms';
import { homeFor, safeNext } from '@/lib/navigation';

const DEMO_ACCOUNTS = [
  { label: 'Owner', email: 'owner@beanbrew.demo' },
  { label: 'Staff', email: 'staff@beanbrew.demo' },
];
const DEMO_PASSWORD = 'DemoPass123!';

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const login = useLogin();
  const form = useForm({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors } = form.formState;

  const submit = (input: LoginInput) =>
    login.mutate(input, { onSuccess: (me) => router.replace(next ?? homeFor(me)) });

  const failure = login.error
    ? isApiError(login.error, 429)
      ? `Too many attempts. Try again in ${login.error.problem.retryAfterSeconds ?? 60} seconds.`
      : errorMessage(login.error)
    : null;

  return (
    <AuthCard
      title="Sign in to PointsHub"
      description="Run your loyalty programme from one place."
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create a business account
          </Link>
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
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 rounded-md border border-dashed p-3 text-sm">
        <p className="font-medium">Try the demo</p>
        <p className="mt-1 text-muted-foreground">
          Bean &amp; Brew Café, with six months of history. Password <code>{DEMO_PASSWORD}</code>.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.setValue('email', account.email);
                form.setValue('password', DEMO_PASSWORD);
              }}
            >
              Use {account.label.toLowerCase()} login
            </Button>
          ))}
        </div>
        <p className="mt-3 text-muted-foreground">
          Or see it as a customer:{' '}
          <Link href="/c/bean-and-brew/login" className="font-medium text-primary hover:underline">
            Bean &amp; Brew rewards portal
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
