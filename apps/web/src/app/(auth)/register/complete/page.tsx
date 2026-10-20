import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CompleteRegistrationForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: 'Finish creating your account' };

export default function CompleteRegistrationPage() {
  return (
    <Suspense>
      <CompleteRegistrationForm />
    </Suspense>
  );
}
