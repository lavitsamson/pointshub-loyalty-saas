import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

const features = [
  {
    title: 'Points on every purchase',
    body: 'Staff record a sale in seconds; customers earn points with tier and campaign multipliers.',
  },
  {
    title: 'Tiers and rewards',
    body: 'Bronze, Silver, Gold — or your own. Customers redeem rewards with a code at the counter.',
  },
  {
    title: 'Know your regulars',
    body: 'Dashboards, at-risk customers, and plain-language questions about your data.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>
      <main id="main" className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">PointsHub</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Loyalty programmes for cafés, salons and local shops.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Reward your regulars, see what keeps them coming back, and run it all from one
            dashboard.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/register">Create a business account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Try the demo</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">
            Features
          </h2>
          <ul className="grid gap-6 sm:grid-cols-3">
            {features.map((feature) => (
              <li key={feature.title} className="rounded-lg border bg-card p-5">
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
