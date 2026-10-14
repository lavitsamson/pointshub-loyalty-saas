'use client';

import {
  AdjustPointsSchema,
  BULK_MAX_CUSTOMERS,
  type BulkActionInput,
  CreateCustomerSchema,
  type Customer,
  UpdateCustomerSchema,
} from '@pointshub/shared';
import { type FieldErrors, useForm, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  useAdjustPoints,
  useBulkAction,
  useCreateCustomer,
  useUpdateCustomer,
} from '@/lib/api/customers';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { formatNumber, formatPointsDelta } from '@/lib/format';

/** "regular, vip" in a text box → ["regular", "vip"], validated by the API's tag rules. */
const tagsText = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  )
  .pipe(CreateCustomerSchema.shape.tags.unwrap());

const CreateForm = CreateCustomerSchema.extend({
  phone: z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .pipe(CreateCustomerSchema.shape.phone),
  tags: tagsText,
});

const EditForm = z.object({
  name: UpdateCustomerSchema.shape.name.unwrap(),
  email: UpdateCustomerSchema.shape.email.unwrap(),
  phone: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(UpdateCustomerSchema.shape.phone.unwrap()),
  tags: tagsText,
});

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create and edit forms share the same text inputs; only their parsed output differs. */
type CustomerFormInput = z.input<typeof CreateForm>;

function CustomerFields({
  form,
}: {
  form: {
    register: UseFormRegister<CustomerFormInput>;
    formState: { errors: FieldErrors<CustomerFormInput> };
  };
}) {
  const { errors } = form.formState;
  return (
    <>
      <Field id="c-name" label="Name" error={errors.name?.message}>
        <Input
          autoComplete="off"
          {...describedBy('c-name', errors.name?.message)}
          {...form.register('name')}
        />
      </Field>
      <Field id="c-email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="off"
          {...describedBy('c-email', errors.email?.message)}
          {...form.register('email')}
        />
      </Field>
      <Field id="c-phone" label="Phone (optional)" error={errors.phone?.message}>
        <Input
          type="tel"
          autoComplete="off"
          {...describedBy('c-phone', errors.phone?.message)}
          {...form.register('phone')}
        />
      </Field>
      <Field
        id="c-tags"
        label="Tags (optional)"
        error={errors.tags?.message}
        hint="Separate with commas, e.g. regular, student"
      >
        <Input
          autoComplete="off"
          {...describedBy('c-tags', errors.tags?.message, true)}
          {...form.register('tags')}
        />
      </Field>
    </>
  );
}

export function CreateCustomerDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
  initialEmail = '',
}: DialogProps & {
  tenantId: string;
  onCreated?: (customer: Customer) => void;
  initialEmail?: string;
}) {
  const create = useCreateCustomer(tenantId);
  const form = useForm({
    resolver: zodResolver(CreateForm),
    values: { name: '', email: initialEmail, phone: '', tags: '' },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          create.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Add a customer"
        description="They can sign in to the customer portal later with this email."
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            create.mutate(input, {
              onSuccess: (customer) => {
                toast({ title: `${customer.name} added`, variant: 'success' });
                onOpenChange(false);
                form.reset();
                onCreated?.(customer);
              },
              onError: (error) => applyServerErrors(form, error),
            }),
          )}
        >
          <FormError error={create.error} />
          <CustomerFields form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditCustomerDialog({
  tenantId,
  customer,
  open,
  onOpenChange,
}: DialogProps & { tenantId: string; customer: Customer }) {
  const update = useUpdateCustomer(tenantId, customer.id);
  const form = useForm({
    resolver: zodResolver(EditForm),
    values: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? '',
      tags: customer.tags.join(', '),
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit customer">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            update.mutate(input, {
              onSuccess: () => {
                toast({ title: 'Customer updated', variant: 'success' });
                onOpenChange(false);
              },
              onError: (error) => applyServerErrors(form, error),
            }),
          )}
        >
          <FormError error={update.error} />
          <CustomerFields form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Points and a reason; shared by the single-customer and bulk adjustment dialogs. */
type PointsFormInput = z.input<typeof AdjustPointsSchema>;

function PointsReasonFields({
  form,
}: {
  form: {
    register: UseFormRegister<PointsFormInput>;
    formState: { errors: FieldErrors<PointsFormInput> };
  };
}) {
  const { errors } = form.formState;
  return (
    <>
      <Field
        id="adj-points"
        label="Points"
        error={errors.points?.message}
        hint="Use a negative number to remove points, e.g. -50."
      >
        <Input
          type="number"
          inputMode="numeric"
          step={1}
          {...describedBy('adj-points', errors.points?.message, true)}
          {...form.register('points', { valueAsNumber: true })}
        />
      </Field>
      <Field
        id="adj-reason"
        label="Reason"
        error={errors.reason?.message}
        hint="Shown in the ledger and the audit log."
      >
        <Input
          autoComplete="off"
          {...describedBy('adj-reason', errors.reason?.message, true)}
          {...form.register('reason')}
        />
      </Field>
    </>
  );
}

export function AdjustPointsDialog({
  tenantId,
  customer,
  open,
  onOpenChange,
}: DialogProps & { tenantId: string; customer: Customer }) {
  const adjust = useAdjustPoints(tenantId, customer.id);
  const form = useForm({
    resolver: zodResolver(AdjustPointsSchema),
    defaultValues: { points: Number.NaN, reason: '' },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          adjust.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Adjust points"
        description={`${customer.name} has ${formatNumber(customer.pointsBalance)} points.`}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            adjust.mutate(input, {
              onSuccess: (entry) => {
                toast({
                  title: `${formatPointsDelta(entry.points)} points`,
                  description: `New balance: ${formatNumber(entry.balanceAfter)}`,
                  variant: 'success',
                });
                form.reset();
                onOpenChange(false);
              },
              onError: (error) => applyServerErrors(form, error),
            }),
          )}
        >
          <FormError error={adjust.error} />
          <PointsReasonFields form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending ? 'Saving…' : 'Adjust points'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type BulkKind = BulkActionInput['action'];

const TagForm = z.object({ tag: CreateCustomerSchema.shape.tags.unwrap().element });

const BULK_COPY: Record<BulkKind, { title: string; submit: string; done: string }> = {
  ADJUST_POINTS: { title: 'Adjust points', submit: 'Adjust points', done: 'Points adjusted' },
  ADD_TAG: { title: 'Add a tag', submit: 'Add tag', done: 'Tag added' },
  REMOVE_TAG: { title: 'Remove a tag', submit: 'Remove tag', done: 'Tag removed' },
};

/**
 * Applies one action to every selected customer. The API runs it in a single transaction, so
 * either all of them change or none do.
 */
export function BulkActionDialog({
  tenantId,
  kind,
  customerIds,
  onOpenChange,
  onDone,
}: {
  tenantId: string;
  kind: BulkKind | null;
  customerIds: string[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const copy = kind ? BULK_COPY[kind] : null;
  const description = (
    <>
      Applies to {formatNumber(customerIds.length)} selected customer
      {customerIds.length === 1 ? '' : 's'}, all or nothing.
    </>
  );

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      {kind && copy && (
        <DialogContent title={copy.title} description={description}>
          {customerIds.length > BULK_MAX_CUSTOMERS ? (
            <p className="text-sm text-destructive">
              Select at most {BULK_MAX_CUSTOMERS} customers for one bulk action.
            </p>
          ) : kind === 'ADJUST_POINTS' ? (
            <BulkPointsForm
              tenantId={tenantId}
              customerIds={customerIds}
              copy={copy}
              onDone={onDone}
            />
          ) : (
            <BulkTagForm
              tenantId={tenantId}
              kind={kind}
              customerIds={customerIds}
              copy={copy}
              onDone={onDone}
            />
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

function BulkFooter({ pending, label }: { pending: boolean; label: string }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="outline">
          Cancel
        </Button>
      </DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? 'Applying…' : label}
      </Button>
    </DialogFooter>
  );
}

interface BulkFormProps {
  tenantId: string;
  customerIds: string[];
  copy: (typeof BULK_COPY)[BulkKind];
  onDone: () => void;
}

function useBulkSubmit({ tenantId, copy, onDone }: BulkFormProps) {
  const bulk = useBulkAction(tenantId);
  const run = (input: BulkActionInput) =>
    bulk.mutate(input, {
      onSuccess: ({ affected }) => {
        toast({
          title: copy.done,
          description: `${formatNumber(affected)} customer${affected === 1 ? '' : 's'} updated.`,
          variant: 'success',
        });
        onDone();
      },
    });
  return { bulk, run };
}

function BulkPointsForm(props: BulkFormProps) {
  const { bulk, run } = useBulkSubmit(props);
  const form = useForm({
    resolver: zodResolver(AdjustPointsSchema),
    defaultValues: { points: Number.NaN, reason: '' },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((params) =>
        run({ action: 'ADJUST_POINTS', customerIds: props.customerIds, params }),
      )}
    >
      <FormError error={bulk.error} />
      <PointsReasonFields form={form} />
      <BulkFooter pending={bulk.isPending} label={props.copy.submit} />
    </form>
  );
}

function BulkTagForm(props: BulkFormProps & { kind: 'ADD_TAG' | 'REMOVE_TAG' }) {
  const { bulk, run } = useBulkSubmit(props);
  const form = useForm({ resolver: zodResolver(TagForm), defaultValues: { tag: '' } });
  const error = form.formState.errors.tag?.message;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((params) =>
        run({ action: props.kind, customerIds: props.customerIds, params }),
      )}
    >
      <FormError error={bulk.error} />
      <Field id="bulk-tag" label="Tag" error={error}>
        <Input autoComplete="off" {...describedBy('bulk-tag', error)} {...form.register('tag')} />
      </Field>
      <BulkFooter pending={bulk.isPending} label={props.copy.submit} />
    </form>
  );
}
