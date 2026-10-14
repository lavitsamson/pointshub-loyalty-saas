'use client';

import {
  canManageMember,
  CreateInvitationSchema,
  type InvitableRole,
  type Member,
  Permission,
} from '@pointshub/shared';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session-gate';
import { useTenant } from '@/components/app/tenant-context';
import { ConfirmButton } from '@/components/confirm-button';
import { FormError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
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
  useChangeRole,
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
} from '@/lib/api/team';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { notify } from '@/lib/notify';
import { formatDate } from '@/lib/format';

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', STAFF: 'Staff' } as const;
const INVITABLE: InvitableRole[] = ['STAFF', 'ADMIN'];

export function TeamPage() {
  const tenant = useTenant();
  const canManage = tenant.can(Permission.ManageTeam);

  return (
    <>
      <PageHeader title="Team" description="People who can sign in to this business." />
      <div className="flex flex-col gap-6">
        {canManage && <InviteCard tenantId={tenant.tenantId} />}
        <MembersCard />
        {canManage && <PendingInvitations tenantId={tenant.tenantId} />}
      </div>
    </>
  );
}

function InviteCard({ tenantId }: { tenantId: string }) {
  const invite = useInvite(tenantId);
  const form = useForm({
    resolver: zodResolver(CreateInvitationSchema),
    defaultValues: { email: '', role: 'STAFF' as InvitableRole },
  });
  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>
          Staff record purchases and fulfil rewards. Admins also manage the programme, customers and
          team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            invite.mutate(input, {
              onSuccess: (inv) => {
                toast({ title: 'Invitation sent', description: inv.email, variant: 'success' });
                form.reset();
              },
              onError: (e) => applyServerErrors(form, e),
            }),
          )}
        >
          <FormError error={invite.error} />
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <Field id="inv-email" label="Email" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="off"
                {...describedBy('inv-email', errors.email?.message)}
                {...form.register('email')}
              />
            </Field>
            <Field id="inv-role" label="Role" error={errors.role?.message}>
              <Select {...describedBy('inv-role', errors.role?.message)} {...form.register('role')}>
                {INVITABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MembersCard() {
  const tenant = useTenant();
  const members = useMembers(tenant.tenantId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
      </CardHeader>
      <CardContent>
        {members.isPending ? (
          <LoadingRows rows={3} label="Loading members" />
        ) : members.isError ? (
          <ErrorState
            message={errorMessage(members.error)}
            onRetry={() => void members.refetch()}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.items.map((m) => (
                <MemberRow key={m.userId} member={m} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({ member }: { member: Member }) {
  const tenant = useTenant();
  const me = useSession();
  const router = useRouter();
  const changeRole = useChangeRole(tenant.tenantId);
  const remove = useRemoveMember(tenant.tenantId);
  const isMe = member.userId === me.user.id;
  // Owners are created at registration and cannot be demoted here.
  const editable = !isMe && member.role !== 'OWNER' && canManageMember(tenant.role, member.role);
  const removable = !isMe && canManageMember(tenant.role, member.role);

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{member.name}</span>
        {isMe && <span className="text-muted-foreground"> (you)</span>}
        <span className="block text-xs text-muted-foreground">{member.email}</span>
      </TableCell>
      <TableCell>
        {editable ? (
          <Select
            aria-label={`Role for ${member.name}`}
            className="w-28"
            value={member.role}
            disabled={changeRole.isPending}
            onChange={(e) =>
              changeRole.mutate(
                { userId: member.userId, input: { role: e.target.value as InvitableRole } },
                {
                  onSuccess: () =>
                    toast({
                      title: `${member.name} is now ${ROLE_LABEL[e.target.value as InvitableRole].toLowerCase()}`,
                    }),
                  onError: (err) =>
                    toast({
                      title: 'Could not change role',
                      description: errorMessage(err),
                      variant: 'destructive',
                    }),
                },
              )
            }
          >
            {INVITABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        ) : (
          <Badge variant={member.role === 'OWNER' ? 'default' : 'outline'}>
            {ROLE_LABEL[member.role]}
          </Badge>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {formatDate(member.joinedAt)}
      </TableCell>
      <TableCell className="text-right">
        {isMe ? (
          <ConfirmButton
            variant="ghost"
            size="sm"
            title={`Leave ${tenant.tenantName}?`}
            description="You will lose access until someone invites you again. The last owner cannot leave."
            confirmLabel="Leave business"
            pending={remove.isPending}
            onConfirm={() =>
              void notify(remove.mutateAsync(member.userId), { failure: 'Could not leave' }).then(
                (left) => left !== undefined && router.replace('/app'),
              )
            }
          >
            Leave
          </ConfirmButton>
        ) : (
          removable && (
            <ConfirmButton
              variant="ghost"
              size="sm"
              className="text-destructive"
              title={`Remove ${member.name}?`}
              description="They are signed out of this business straight away."
              confirmLabel="Remove"
              pending={remove.isPending}
              onConfirm={() =>
                void notify(remove.mutateAsync(member.userId), {
                  success: () => ({ title: `${member.name} removed` }),
                  failure: 'Could not remove',
                })
              }
            >
              Remove
            </ConfirmButton>
          )
        )}
      </TableCell>
    </TableRow>
  );
}

function PendingInvitations({ tenantId }: { tenantId: string }) {
  const invitations = useInvitations(tenantId);
  const revoke = useRevokeInvitation(tenantId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>Invitation links expire after 7 days.</CardDescription>
      </CardHeader>
      <CardContent>
        {invitations.isPending ? (
          <LoadingRows rows={2} label="Loading invitations" />
        ) : invitations.isError ? (
          <ErrorState
            message={errorMessage(invitations.error)}
            onRetry={() => void invitations.refetch()}
          />
        ) : invitations.items.length === 0 ? (
          <EmptyState title="No pending invitations" />
        ) : (
          <ul className="flex flex-col divide-y">
            {invitations.items.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[inv.role]} · expires {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() =>
                    void notify(revoke.mutateAsync(inv.id), {
                      success: () => ({ title: 'Invitation withdrawn' }),
                      failure: 'Could not withdraw',
                    })
                  }
                >
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
