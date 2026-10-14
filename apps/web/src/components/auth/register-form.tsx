'use client';

import { PASSWORD_MIN_LENGTH, type RegisterInput, RegisterSchema } from '@pointshub/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { describedBy, Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useRegister } from '@/lib/api/auth';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { homeFor } from '@/lib/navigation';

const CURRENCIES = [
  { code: 'GBP', label: 'British pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'US dollar ($)' },
  { code: 'AUD', label: 'Australian dollar (A$)' },
  { code: 'CAD', label: 'Canadian dollar (C$)' },
];

export function RegisterForm() {
  const router = useRouter();
  const register = useRegister();
  const form = useForm({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: '', email: '', password: '', businessName: '', currency: 'GBP' },
  });
  const { errors } = form.formState;
  const passwordHint = `At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`;

  const submit = (input: RegisterInput) =>
    register.mutate(input, {
      onSuccess: (me) => router.replace(homeFor(me)),
      onError: (error) => applyServerErrors(form, error),
    });

  return (
    <AuthCard
      title="Create your business account"
      description="We set up a loyalty programme with Bronze, Silver and Gold tiers to start you off."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
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
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            {...describedBy('email', errors.email?.message)}
            {...form.register('email')}
          />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message} hint={passwordHint}>
          <Input
            type="password"
            autoComplete="new-password"
            {...describedBy('password', errors.password?.message, true)}
            {...form.register('password')}
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
          {register.isPending ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
