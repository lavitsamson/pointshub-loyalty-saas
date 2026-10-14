'use client';

import { X } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

interface ToastMessage {
  id: number;
  title: string;
  description?: string | undefined;
  variant: 'default' | 'success' | 'destructive';
}

// A tiny module-level store so any component (or mutation callback) can raise a toast.
let toasts: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(message: Omit<ToastMessage, 'id' | 'variant'> & Partial<ToastMessage>) {
  toasts = [...toasts, { variant: 'default', ...message, id: nextId++ }];
  emit();
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => toasts;
const NO_TOASTS: ToastMessage[] = [];
const getServerSnapshot = () => NO_TOASTS;

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {items.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          type={item.variant === 'destructive' ? 'foreground' : 'background'}
          onOpenChange={(open) => !open && dismiss(item.id)}
          className={cn(
            'relative flex w-full flex-col gap-1 rounded-lg border bg-card p-4 pr-10 shadow-lg',
            item.variant === 'success' && 'border-success/60',
            item.variant === 'destructive' && 'border-destructive/60',
          )}
        >
          <ToastPrimitive.Title
            className={cn(
              'text-sm font-semibold',
              item.variant === 'success' && 'text-success',
              item.variant === 'destructive' && 'text-destructive',
            )}
          >
            {item.title}
          </ToastPrimitive.Title>
          {item.description && (
            <ToastPrimitive.Description className="text-sm text-muted-foreground">
              {item.description}
            </ToastPrimitive.Description>
          )}
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="absolute top-3 right-3 rounded-sm opacity-70 hover:opacity-100"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  );
}
