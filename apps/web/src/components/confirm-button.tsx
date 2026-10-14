'use client';

import { type ComponentProps, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

/** A button that asks before doing something destructive. */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  children,
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, 'onClick'> & {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep it</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
