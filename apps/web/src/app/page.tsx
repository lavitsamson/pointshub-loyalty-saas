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
    <main className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-20">
      <header className="flex flex-col gap-4">
        <p className="text-sm font-semibold tracking-wide text-[var(--primary)] uppercase">
          PointsHub
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Loyalty programmes for cafés, salons and local shops.
        </h1>
        <p className="max-w-2xl text-lg text-[var(--muted)]">
          Reward your regulars, see what keeps them coming back, and run it all from one dashboard.
        </p>
      </header>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="sr-only">
          Features
        </h2>
        <ul className="grid gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <li
              key={feature.title}
              className="rounded-lg border border-slate-200 p-5 dark:border-slate-800"
            >
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
