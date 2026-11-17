import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  UsersRound,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/brand/AppLogo';
import { useAuthStore } from '@/store/auth.store';
import { useSyncStatus } from '@/lib/offline-sync';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/pos', icon: ShoppingCart, label: 'Billing' },
  { to: '/products', icon: Package, label: 'Products', adminOnly: false },
  { to: '/inventory', icon: Warehouse, label: 'Inventory', adminOnly: true },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/profile', icon: UserRound, label: 'Profile' },
  { to: '/reports', icon: BarChart3, label: 'Reports', adminOnly: true },
  { to: '/users', icon: UsersRound, label: 'Manage Users', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
];

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const { online, pendingCount, syncing, error } = useSyncStatus();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-background)]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)]">
        <div className="flex items-center gap-3 border-b border-[var(--color-sidebar-border)] px-4 py-4">
          <AppLogo size={36} rounded="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-[var(--color-foreground)]">
              Devi Times
            </p>
            <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
              Billing & POS
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {filteredNav.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-active-text)]'
                    : 'text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]'
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-sidebar-border)] p-3">
          <div className="mb-2 rounded-lg bg-[var(--color-muted)] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
              {user?.name}
            </p>
            <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
              {user?.role}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div
          className="flex min-h-9 items-center gap-2 border-b border-[var(--color-border)] px-5 text-xs md:px-8"
          role="status"
          aria-live="polite"
        >
          <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-amber-500'}`} />
          <span>{online ? 'Online' : 'Offline — changes are saved on this device'}</span>
          {syncing && <span className="text-[var(--color-muted-foreground)]">· Syncing…</span>}
          {!syncing && pendingCount > 0 && (
            <span className="text-[var(--color-muted-foreground)]">
              · {pendingCount} change{pendingCount === 1 ? '' : 's'} waiting to sync
            </span>
          )}
          {error && <span className="truncate text-red-600">· Sync needs attention: {error}</span>}
        </div>
        <div className="flex-1 overflow-auto p-5 md:p-8">
          <div className="page-shell">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
