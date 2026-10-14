import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-20">
      <EmptyState
        title="Page not found"
        description="The link may be out of date, or the page has moved."
        action={
          <Button asChild variant="outline">
            <Link href="/app">Go to your dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
