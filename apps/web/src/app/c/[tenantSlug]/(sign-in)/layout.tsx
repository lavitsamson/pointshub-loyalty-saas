import type { ReactNode } from 'react';

export default function SignInLayout({ children }: { children: ReactNode }) {
  return <div className="sm:pt-6">{children}</div>;
}
