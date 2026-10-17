'use client';

import { Permission } from '@pointshub/shared';
import {
  Check,
  ChevronsUpDown,
  ClipboardList,
  ExternalLink,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings2,
  ShoppingBag,
  Ticket,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { useSession } from '@/components/app/session-gate';
import { useTenant } from '@/components/app/tenant-context';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/lib/api/auth';
import { dashboardPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

const NAV: NavItem[] = [
  {
    href: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    permission: Permission.ViewCustomers,
  },
  {
    href: 'record-purchase',
    label: 'Record purchase',
    icon: ShoppingBag,
    permission: Permission.RecordPurchase,
  },
  { href: 'customers', label: 'Customers', icon: Users, permission: Permission.ViewCustomers },
  {
    href: 'redemptions',
    label: 'Redemptions',
    icon: Ticket,
    permission: Permission.FulfilRedemption,
  },
  { href: 'rewards', label: 'Rewards', icon: Gift, permission: Permission.ViewCustomers },
  { href: 'program', label: 'Programme', icon: Settings2, permission: Permission.ViewCustomers },
  { href: 'team', label: 'Team', icon: UsersRound, permission: Permission.ViewCustomers },
  { href: 'audit-log', label: 'Audit log', icon: ScrollText, permission: Permission.ViewAuditLog },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const tenant = useTenant();
  const pathname = usePathname();
  const base = `/app/${tenant.tenantId}`;

  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {NAV.filter((item) => tenant.can(item.permission)).map((item) => {
          const href = `${base}/${item.href}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={item.href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  active && 'bg-secondary text-secondary-foreground hover:bg-secondary',
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li className="mt-4 border-t pt-4">
          {/* Where customers sign in; staff share this link with them. */}
          <Link
            href={`/c/${tenant.tenantSlug}`}
            target="_blank"
            rel="noopener"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-4" aria-hidden />
            Customer portal
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

function TenantSwitcher() {
  const me = useSession();
  const tenant = useTenant();
  const router = useRouter();

  if (me.memberships.length < 2) {
    return <p className="truncate px-1 text-sm font-semibold">{tenant.tenantName}</p>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between" aria-label="Switch business">
          <span className="truncate">{tenant.tenantName}</span>
          <ChevronsUpDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your businesses</DropdownMenuLabel>
        {me.memberships.map((m) => (
          <DropdownMenuItem
            key={m.tenantId}
            onSelect={() => router.push(dashboardPath(m.tenantId))}
          >
            <Check
              className={cn(m.tenantId === tenant.tenantId ? 'opacity-100' : 'opacity-0')}
              aria-hidden
            />
            <span className="truncate">{m.tenantName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const me = useSession();
  const tenant = useTenant();
  const logout = useLogout();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          >
            {me.user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate text-sm sm:inline">{me.user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block truncate text-foreground">{me.user.email}</span>
          <span className="font-normal capitalize">{tenant.role.toLowerCase()}</span>
        </DropdownMenuLabel>
        {me.memberships.length > 1 && (
          <DropdownMenuItem onSelect={() => router.push('/app')}>
            <ClipboardList aria-hidden /> All businesses
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ plan, children }: { plan?: string | undefined; children: ReactNode }) {
  const tenant = useTenant();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card p-4 md:flex">
        <Logo href={dashboardPath(tenant.tenantId)} />
        <TenantSwitcher />
        <NavLinks />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-4 backdrop-blur">
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Menu"
              className="top-0 left-0 h-dvh max-h-dvh w-72 translate-none rounded-none"
            >
              <TenantSwitcher />
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </DialogContent>
          </Dialog>
          <span className="truncate font-semibold md:hidden">{tenant.tenantName}</span>
          {plan && (
            <Badge variant={plan === 'PRO' ? 'default' : 'muted'} className="hidden sm:inline-flex">
              {plan} plan
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
