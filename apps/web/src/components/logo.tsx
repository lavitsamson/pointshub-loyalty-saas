import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Sparkles className="size-4" aria-hidden />
      </span>
      PointsHub
    </Link>
  );
}
