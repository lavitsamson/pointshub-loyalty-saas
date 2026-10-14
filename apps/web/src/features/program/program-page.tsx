'use client';

import {
  type Campaign,
  CreateCampaignSchema,
  CreateTierSchema,
  type LoyaltyProgram,
  Permission,
  type Tier,
  UpdateLoyaltyProgramSchema,
  UpdateTenantSchema,
} from '@pointshub/shared';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Checkbox, Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/client';
import {
  useCampaigns,
  useDeleteCampaign,
  useDeleteTier,
  useProgram,
  useSaveCampaign,
  useSaveTier,
  useTenantDetails,
  useTiers,
  useUpdateProgram,
  useUpdateTenant,
} from '@/lib/api/program';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { formatDateTime, formatNumber } from '@/lib/format';

export function ProgramPage() {
  const tenant = useTenant();
  const canManage = tenant.can(Permission.ManageProgram);

  return (
    <>
      <PageHeader
        title="Programme"
        description={
          canManage
            ? 'How customers earn points, the tiers they climb and your promotions.'
            : 'How customers earn points. Ask an owner or admin to change these settings.'
        }
      />
      <div className="flex flex-col gap-6">
        {tenant.can(Permission.UpdateTenant) && <BusinessCard tenantId={tenant.tenantId} />}
        <EarningCard tenantId={tenant.tenantId} canManage={canManage} />
        <TiersCard tenantId={tenant.tenantId} canManage={canManage} />
        <CampaignsCard tenantId={tenant.tenantId} canManage={canManage} />
      </div>
    </>
  );
}

function SaveButton({ pending, dirty }: { pending: boolean; dirty: boolean }) {
  return (
    <Button type="submit" disabled={pending || !dirty} className="self-start">
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

function BusinessCard({ tenantId }: { tenantId: string }) {
  const details = useTenantDetails(tenantId);
  const update = useUpdateTenant(tenantId);
  const form = useForm({
    resolver: zodResolver(UpdateTenantSchema),
    values: { name: details.data?.name ?? '' },
  });
  const error = form.formState.errors.name?.message;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4 sm:max-w-md"
          onSubmit={form.handleSubmit((input) =>
            update.mutate(input, {
              onSuccess: () => toast({ title: 'Business name saved', variant: 'success' }),
              onError: (e) => applyServerErrors(form, e),
            }),
          )}
        >
          <FormError error={update.error} />
          <Field id="b-name" label="Business name" error={error}>
            <Input {...describedBy('b-name', error)} {...form.register('name')} />
          </Field>
          <SaveButton pending={update.isPending} dirty={form.formState.isDirty} />
        </form>
      </CardContent>
    </Card>
  );
}

const EarningSchema = z.object({
  pointsPerCurrencyUnit: UpdateLoyaltyProgramSchema.shape.pointsPerCurrencyUnit.unwrap(),
  // A blank expiry means points never expire.
  pointsExpiryMonths: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(UpdateLoyaltyProgramSchema.shape.pointsExpiryMonths.unwrap()),
});

function EarningCard({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const program = useProgram(tenantId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Earning rules</CardTitle>
        <CardDescription>
          Points = amount × points per unit × tier multiplier × best active campaign multiplier,
          rounded down.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {program.isPending ? (
          <LoadingRows rows={2} label="Loading programme" />
        ) : program.isError ? (
          <ErrorState
            message={errorMessage(program.error)}
            onRetry={() => void program.refetch()}
          />
        ) : (
          <EarningSettingsForm tenantId={tenantId} program={program.data} canManage={canManage} />
        )}
      </CardContent>
    </Card>
  );
}

function EarningSettingsForm({
  tenantId,
  program,
  canManage,
}: {
  tenantId: string;
  program: LoyaltyProgram;
  canManage: boolean;
}) {
  const update = useUpdateProgram(tenantId);
  const form = useForm({
    resolver: zodResolver(EarningSchema),
    values: {
      pointsPerCurrencyUnit: program.pointsPerCurrencyUnit,
      pointsExpiryMonths:
        program.pointsExpiryMonths === null ? '' : String(program.pointsExpiryMonths),
    },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((input) =>
        update.mutate(input, {
          onSuccess: () => toast({ title: 'Earning rules saved', variant: 'success' }),
          onError: (e) => applyServerErrors(form, e),
        }),
      )}
    >
      <FormError error={update.error} />
      <fieldset disabled={!canManage} className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <Field
          id="p-rate"
          label={`Points per ${program.currency} 1`}
          error={errors.pointsPerCurrencyUnit?.message}
        >
          <Input
            inputMode="decimal"
            {...describedBy('p-rate', errors.pointsPerCurrencyUnit?.message)}
            {...form.register('pointsPerCurrencyUnit')}
          />
        </Field>
        <Field
          id="p-expiry"
          label="Points expire after (months)"
          error={errors.pointsExpiryMonths?.message}
          hint="Leave blank so points never expire."
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            {...describedBy('p-expiry', errors.pointsExpiryMonths?.message, true)}
            {...form.register('pointsExpiryMonths')}
          />
        </Field>
      </fieldset>
      {canManage && <SaveButton pending={update.isPending} dirty={form.formState.isDirty} />}
    </form>
  );
}

// --- Tiers -------------------------------------------------------------------

function TiersCard({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const tiers = useTiers(tenantId);
  const remove = useDeleteTier(tenantId);
  const [editing, setEditing] = useState<Tier | 'new' | null>(null);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Tiers</CardTitle>
          <CardDescription>
            Customers move up as their lifetime points grow. Tiers never drop.
          </CardDescription>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Add tier
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {tiers.isPending ? (
          <LoadingRows rows={3} label="Loading tiers" />
        ) : tiers.isError ? (
          <ErrorState message={errorMessage(tiers.error)} onRetry={() => void tiers.refetch()} />
        ) : tiers.data.length === 0 ? (
          <EmptyState title="No tiers" description="Every customer earns at the base rate." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">From lifetime points</TableHead>
                <TableHead className="text-right">Multiplier</TableHead>
                {canManage && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.data.map((tier) => (
                <TableRow key={tier.id}>
                  <TableCell className="font-medium">{tier.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(tier.minLifetimePoints)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">×{tier.multiplier}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${tier.name}`}
                          onClick={() => setEditing(tier)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${tier.name}`}
                          title={`Delete the ${tier.name} tier?`}
                          description="Customers in this tier keep their points but have no tier until they next earn, when they are placed in the right remaining tier."
                          confirmLabel="Delete tier"
                          onConfirm={() =>
                            remove.mutate(tier.id, {
                              onError: (e) =>
                                toast({
                                  title: 'Could not delete tier',
                                  description: errorMessage(e),
                                  variant: 'destructive',
                                }),
                            })
                          }
                        >
                          <Trash2 aria-hidden />
                        </ConfirmButton>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {canManage && (
        <TierDialog
          tenantId={tenantId}
          tier={editing === 'new' ? null : editing}
          nextSortOrder={(tiers.data?.length ?? 0) + 1}
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </Card>
  );
}

function TierDialog({
  tenantId,
  tier,
  nextSortOrder,
  open,
  onOpenChange,
}: {
  tenantId: string;
  tier: Tier | null;
  nextSortOrder: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveTier(tenantId);
  const form = useForm({
    resolver: zodResolver(CreateTierSchema),
    values: {
      name: tier?.name ?? '',
      minLifetimePoints: tier?.minLifetimePoints ?? Number.NaN,
      multiplier: tier?.multiplier ?? '1',
      sortOrder: tier?.sortOrder ?? nextSortOrder,
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
      <DialogContent title={tier ? `Edit ${tier.name}` : 'New tier'}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            save.mutate(
              { id: tier?.id, input },
              {
                onSuccess: () => {
                  toast({ title: 'Tier saved', variant: 'success' });
                  onOpenChange(false);
                },
                onError: (e) => applyServerErrors(form, e),
              },
            ),
          )}
        >
          <FormError error={save.error} />
          <Field id="t-name" label="Name" error={errors.name?.message}>
            <Input {...describedBy('t-name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="t-min"
              label="From lifetime points"
              error={errors.minLifetimePoints?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                {...describedBy('t-min', errors.minLifetimePoints?.message)}
                {...form.register('minLifetimePoints', { valueAsNumber: true })}
              />
            </Field>
            <Field
              id="t-mult"
              label="Multiplier"
              error={errors.multiplier?.message}
              hint="1 to 10, e.g. 1.25"
            >
              <Input
                inputMode="decimal"
                {...describedBy('t-mult', errors.multiplier?.message, true)}
                {...form.register('multiplier')}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save tier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Campaigns ---------------------------------------------------------------

function campaignState(c: Campaign, now = Date.now()) {
  if (!c.active) return { label: 'Paused', variant: 'muted' as const };
  if (Date.parse(c.endsAt) < now) return { label: 'Ended', variant: 'muted' as const };
  if (Date.parse(c.startsAt) > now) return { label: 'Scheduled', variant: 'outline' as const };
  return { label: 'Live', variant: 'success' as const };
}

function CampaignsCard({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const campaigns = useCampaigns(tenantId);
  const remove = useDeleteCampaign(tenantId);
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>
            Time-limited multipliers, such as double points at the weekend. If several are live, the
            highest one applies.
          </CardDescription>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Add campaign
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {campaigns.isPending ? (
          <LoadingRows rows={2} label="Loading campaigns" />
        ) : campaigns.isError ? (
          <ErrorState
            message={errorMessage(campaigns.error)}
            onRetry={() => void campaigns.refetch()}
          />
        ) : campaigns.data.length === 0 ? (
          <EmptyState title="No campaigns" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Multiplier</TableHead>
                <TableHead className="hidden md:table-cell">Runs</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.data.map((c) => {
                const state = campaignState(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">×{c.multiplier}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDateTime(c.startsAt)} – {formatDateTime(c.endsAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={state.variant}>{state.label}</Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${c.name}`}
                            onClick={() => setEditing(c)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <ConfirmButton
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${c.name}`}
                            title={`Delete “${c.name}”?`}
                            description="Points already earned under it are not affected."
                            confirmLabel="Delete campaign"
                            onConfirm={() =>
                              remove.mutate(c.id, {
                                onError: (e) =>
                                  toast({
                                    title: 'Could not delete campaign',
                                    description: errorMessage(e),
                                    variant: 'destructive',
                                  }),
                              })
                            }
                          >
                            <Trash2 aria-hidden />
                          </ConfirmButton>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {canManage && (
        <CampaignDialog
          tenantId={tenantId}
          campaign={editing === 'new' ? null : editing}
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </Card>
  );
}

/** <input type="datetime-local"> works in local time without a zone; convert at the edges. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function CampaignDialog({
  tenantId,
  campaign,
  open,
  onOpenChange,
}: {
  tenantId: string;
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveCampaign(tenantId);
  const [openedAt] = useState(Date.now);
  const inAWeek = new Date(openedAt + 7 * 24 * 60 * 60 * 1000).toISOString();
  const form = useForm({
    resolver: zodResolver(CreateCampaignSchema),
    values: {
      name: campaign?.name ?? '',
      multiplier: campaign?.multiplier ?? '2',
      startsAt: toLocalInput(campaign?.startsAt ?? new Date(openedAt).toISOString()),
      endsAt: toLocalInput(campaign?.endsAt ?? inAWeek),
      active: campaign?.active ?? true,
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
      <DialogContent title={campaign ? `Edit ${campaign.name}` : 'New campaign'}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            save.mutate(
              { id: campaign?.id, input },
              {
                onSuccess: () => {
                  toast({ title: 'Campaign saved', variant: 'success' });
                  onOpenChange(false);
                },
                onError: (e) => applyServerErrors(form, e),
              },
            ),
          )}
        >
          <FormError error={save.error} />
          <Field id="cm-name" label="Name" error={errors.name?.message}>
            <Input {...describedBy('cm-name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <Field
            id="cm-mult"
            label="Multiplier"
            error={errors.multiplier?.message}
            hint="2 means double points."
          >
            <Input
              inputMode="decimal"
              {...describedBy('cm-mult', errors.multiplier?.message, true)}
              {...form.register('multiplier')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cm-start" label="Starts" error={errors.startsAt?.message}>
              <Input
                type="datetime-local"
                {...describedBy('cm-start', errors.startsAt?.message)}
                {...form.register('startsAt')}
              />
            </Field>
            <Field id="cm-end" label="Ends" error={errors.endsAt?.message}>
              <Input
                type="datetime-local"
                {...describedBy('cm-end', errors.endsAt?.message)}
                {...form.register('endsAt')}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...form.register('active')} /> Active
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save campaign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
