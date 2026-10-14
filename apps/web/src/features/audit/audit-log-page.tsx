'use client';

import type { AuditLogEntry } from '@pointshub/shared';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api/client';
import { useAuditLog, useMembers } from '@/lib/api/team';
import { formatDateTime } from '@/lib/format';

/** "customer.points_adjusted" → "Customer points adjusted". */
function describeAction(action: string): string {
  const text = action.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AuditLogPage() {
  const tenant = useTenant();
  const log = useAuditLog(tenant.tenantId);
  const members = useMembers(tenant.tenantId);
  const names = new Map(members.items.map((m) => [m.userId, m.name]));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made by your team, newest first. Entries cannot be edited or deleted."
      />
      <Card>
        <CardContent className="p-2">
          {log.isPending ? (
            <LoadingRows rows={8} label="Loading audit log" />
          ) : log.isError ? (
            <ErrorState message={errorMessage(log.error)} onRetry={() => void log.refetch()} />
          ) : log.items.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead className="hidden md:table-cell">IP address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.items.map((entry) => (
                    <TableRow key={entry.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell>
                        {entry.actorUserId
                          ? (names.get(entry.actorUserId) ?? 'Former member')
                          : 'System'}
                      </TableCell>
                      <TableCell>
                        <AuditDetails entry={entry} />
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {entry.ip ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {log.hasNextPage && (
                <div className="my-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={log.isFetchingNextPage}
                    onClick={() => void log.fetchNextPage()}
                  >
                    {log.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AuditDetails({ entry }: { entry: AuditLogEntry }) {
  const hasChanges = entry.before !== null || entry.after !== null;
  const title = (
    <>
      <span className="font-medium">{describeAction(entry.action)}</span>{' '}
      <span className="text-muted-foreground">{entry.entityType}</span>
    </>
  );
  if (!hasChanges) return title;
  return (
    <details>
      <summary className="cursor-pointer">{title}</summary>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        {(['before', 'after'] as const).map((side) => (
          <div key={side}>
            <p className="mb-1 font-medium capitalize text-muted-foreground">{side}</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-2">
              {entry[side] === null ? '—' : JSON.stringify(entry[side], null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
