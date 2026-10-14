'use client';

import { ErrorState } from '@/components/ui/feedback';

/** Last-resort boundary for unexpected rendering errors; data errors are handled in place. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-20">
      <ErrorState
        message="The page hit an unexpected problem. Your data is safe; try again."
        onRetry={reset}
      />
    </main>
  );
}
