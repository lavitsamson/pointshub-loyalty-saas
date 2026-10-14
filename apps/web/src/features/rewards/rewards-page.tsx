'use client';

import { CreateRewardSchema, Permission, type Reward } from '@pointshub/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { ConfirmButton } from '@/components/confirm-button';
import { FormError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/client';
import { useDeleteReward, useRewards, useSaveReward } from '@/lib/api/rewards';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { notify } from '@/lib/notify';
import { formatNumber } from '@/lib/format';

/** Text inputs mapped onto the reward contract: a blank stock means unlimited. */
const RewardForm = z.object({
  name: CreateRewardSchema.shape.name,
  description: z.string().trim().max(500),
  pointsCost: CreateRewardSchema.shape.pointsCost,
  stock: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(z.number().int('Must be a whole number').min(0).nullable()),
  active: z.boolean(),
});

export function RewardsPage() {
  const tenant = useTenant();
  const rewards = useRewards(tenant.tenantId);
  const canManage = tenant.can(Permission.ManageProgram);
  const [editing, setEditing] = useState<Reward | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Rewards"
        description="What customers can spend their points on."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden /> New reward
            </Button>
          )
        }
      />

      {rewards.isPending ? (
        <LoadingRows rows={4} label="Loading rewards" />
      ) : rewards.isError ? (
        <ErrorState message={errorMessage(rewards.error)} onRetry={() => void rewards.refetch()} />
      ) : rewards.items.length === 0 ? (
        <EmptyState
          title="No rewards yet"
          description="Rewards give customers a reason to come back. Start with something simple, like a free coffee."
          action={canManage && <Button onClick={() => setEditing('new')}>Create a reward</Button>}
        />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.items.map((reward) => (
              <li key={reward.id}>
                <RewardCard
                  reward={reward}
                  canManage={canManage}
                  tenantId={tenant.tenantId}
                  onEdit={() => setEditing(reward)}
                />
              </li>
            ))}
          </ul>
          {rewards.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => void rewards.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {canManage && (
        <RewardDialog
          tenantId={tenant.tenantId}
          reward={editing === 'new' ? null : editing}
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </>
  );
}

function RewardCard({
  reward,
  canManage,
  tenantId,
  onEdit,
}: {
  reward: Reward;
  canManage: boolean;
  tenantId: string;
  onEdit: () => void;
}) {
  const remove = useDeleteReward(tenantId);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold">{reward.name}</h2>
          {!reward.active && <Badge variant="muted">Inactive</Badge>}
        </div>
        {reward.description && (
          <p className="text-sm text-muted-foreground">{reward.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 text-sm">
          <span className="font-medium tabular-nums">{formatNumber(reward.pointsCost)} points</span>
          <span className="text-muted-foreground">
            {reward.stock === null ? 'Unlimited' : `${formatNumber(reward.stock)} in stock`}
          </span>
        </div>
        {canManage && (
          <div className="flex gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil aria-hidden /> Edit
            </Button>
            <ConfirmButton
              variant="ghost"
              size="sm"
              className="text-destructive"
              title={`Delete “${reward.name}”?`}
              description="Customers will no longer see it. Rewards that were ever redeemed are kept for history: switch those off instead."
              confirmLabel="Delete reward"
              pending={remove.isPending}
              onConfirm={() =>
                void notify(remove.mutateAsync(reward.id), {
                  success: () => ({ title: 'Reward deleted', variant: 'success' }),
                  failure: 'Could not delete reward',
                })
              }
            >
              <Trash2 aria-hidden /> Delete
            </ConfirmButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RewardDialog({
  tenantId,
  reward,
  open,
  onOpenChange,
}: {
  tenantId: string;
  reward: Reward | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveReward(tenantId);
  const form = useForm({
    resolver: zodResolver(RewardForm),
    values: {
      name: reward?.name ?? '',
      description: reward?.description ?? '',
      pointsCost: reward?.pointsCost ?? Number.NaN,
      stock: reward?.stock === null || reward === null ? '' : String(reward.stock),
      active: reward?.active ?? true,
    },
  });
  const { errors } = form.formState;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) save.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={reward ? 'Edit reward' : 'New reward'}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            save.mutate(
              { id: reward?.id, input },
              {
                onSuccess: () => {
                  toast({
                    title: reward ? 'Reward updated' : 'Reward created',
                    variant: 'success',
                  });
                  onOpenChange(false);
                },
                onError: (error) => applyServerErrors(form, error),
              },
            ),
          )}
        >
          <FormError error={save.error} />
          <Field id="r-name" label="Name" error={errors.name?.message}>
            <Input {...describedBy('r-name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <Field
            id="r-description"
            label="Description (optional)"
            error={errors.description?.message}
          >
            <Textarea
              {...describedBy('r-description', errors.description?.message)}
              {...form.register('description')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="r-cost" label="Points cost" error={errors.pointsCost?.message}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                {...describedBy('r-cost', errors.pointsCost?.message)}
                {...form.register('pointsCost', { valueAsNumber: true })}
              />
            </Field>
            <Field
              id="r-stock"
              label="Stock"
              error={errors.stock?.message}
              hint="Blank for unlimited"
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                {...describedBy('r-stock', errors.stock?.message, true)}
                {...form.register('stock')}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...form.register('active')} /> Available to redeem
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save reward'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
