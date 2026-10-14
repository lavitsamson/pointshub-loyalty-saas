import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'PointsHub', template: '%s · PointsHub' },
  description: 'Loyalty and rewards programmes for small businesses.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the theme class before hydration, so the attribute differs by design.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
