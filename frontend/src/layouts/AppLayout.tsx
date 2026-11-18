import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/brand/AppLogo';
import { useAuthStore } from '@/store/auth.store';
import { useSyncStatus } from '@/lib/offline-sync';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getNavigationForRole, isNavigationItemActive, type NavigationItem } from '@/navigation';
import { useApplicationDisplayMode } from '@/lib/display-mode';

function NavigationLink({
  item,
  compact = false,
  onNavigate,
}: {
  item: NavigationItem;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors',
          compact ? 'justify-center px-2 lg:justify-start lg:gap-3 lg:px-3' : 'gap-3 px-3',
          isActive
            ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-active-text)]'
            : 'text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]'
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0 opacity-80" aria-hidden="true" />
      <span className={cn('truncate', compact && 'hidden lg:block')}>{item.label}</span>
    </NavLink>
  );
}

function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { online, pendingCount, syncing, error } = useSyncStatus();
  const Icon = error ? AlertCircle : syncing ? LoaderCircle : online ? Wifi : WifiOff;
  const message = error
    ? 'Sync needs attention'
    : syncing
      ? 'Syncing changes'
      : pendingCount > 0
        ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`
        : online
          ? 'Online'
          : 'Offline — changes are saved on this device';
  const accessibleMessage = error ? `${message}: ${error}` : message;

  if (compact) {
    const shouldShowLabel = Boolean(error || syncing || pendingCount > 0 || !online);

    return (
      <span
        className="flex min-w-0 items-center gap-1 text-[var(--color-muted-foreground)]"
        role="status"
        aria-live="polite"
        aria-label={accessibleMessage}
        title={accessibleMessage}
      >
        <Icon
          className={cn('h-4 w-4 shrink-0', syncing && 'animate-spin')}
          aria-hidden="true"
        />
        {shouldShowLabel && (
          <span className="max-w-[5.5rem] truncate text-[11px]" aria-hidden="true">
            {error ? 'Sync issue' : syncing ? 'Syncing' : pendingCount ? `${pendingCount} pending` : 'Offline'}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="flex min-h-9 items-center gap-2 border-b border-[var(--color-border)] px-5 text-xs md:px-8">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          error ? 'bg-red-600' : online ? 'bg-green-600' : 'bg-amber-600'
        )}
        aria-hidden="true"
      />
      <span>{message}</span>
      {error && <span className="truncate text-red-700">{error}</span>}
    </div>
  );
}

function MobileNavigationDrawer({
  open,
  onOpenChange,
  items,
  name,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavigationItem[];
  name?: string;
  role?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="mobile-drawer-dialog translate-x-0 translate-y-0"
        overlayClassName="mobile-navigation-overlay"
        showCloseButton={false}
        style={{
          position: 'fixed',
          top: 0,
          right: 'auto',
          bottom: 0,
          left: 0,
          width: 'min(22rem, 88vw)',
          height: '100dvh',
          maxWidth: 'none',
          maxHeight: '100dvh',
          transform: 'none',
        }}
      >
        <div className="flex h-[100dvh] min-h-[100dvh] w-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-sidebar-border)] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex min-w-0 items-center gap-3">
              <AppLogo size={36} rounded="lg" />
              <DialogHeader className="mb-0 min-w-0 pr-0">
                <DialogTitle className="truncate text-sm font-medium leading-tight">
                  Devi Times
                </DialogTitle>
                <DialogDescription className="truncate text-[11px]">Billing & POS</DialogDescription>
              </DialogHeader>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <nav aria-label="Main navigation" className="space-y-1">
              {items.map((item) => (
                <NavigationLink
                  key={item.to}
                  item={item}
                  onNavigate={() => onOpenChange(false)}
                />
              ))}
            </nav>
          </div>

          <div className="shrink-0 border-t border-[var(--color-sidebar-border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{name}</p>
            <p className="truncate text-xs text-[var(--color-muted-foreground)]">{role}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MobileTabBar({
  primaryItems,
  secondaryItems,
  moreOpen,
  onMoreOpenChange,
  pathname,
}: {
  primaryItems: NavigationItem[];
  secondaryItems: NavigationItem[];
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  pathname: string;
}) {
  const moreActive = secondaryItems.some((item) => isNavigationItemActive(pathname, item));

  return (
    <>
      <nav className="mobile-tab-bar" aria-label="Primary navigation">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium',
                  isActive
                    ? 'text-[var(--color-sidebar-active-text)]'
                    : 'text-[var(--color-muted-foreground)]'
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium',
            moreActive || moreOpen
              ? 'text-[var(--color-sidebar-active-text)]'
              : 'text-[var(--color-muted-foreground)]'
          )}
          aria-label="More navigation options"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => onMoreOpenChange(true)}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={onMoreOpenChange}>
        <DialogContent
          className="mobile-more-dialog translate-x-0 translate-y-0"
          overlayClassName="mobile-navigation-overlay"
          showCloseButton={false}
        >
          <div className="flex max-h-full min-h-0 flex-col">
            <div className="px-5 pb-2 pt-3">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-border)]" aria-hidden="true" />
              <div className="flex items-start justify-between gap-4">
                <DialogHeader className="mb-0 pr-0">
                  <DialogTitle>More</DialogTitle>
                  <DialogDescription id="mobile-more-description">
                    Other shop tools and your account
                  </DialogDescription>
                </DialogHeader>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close more navigation">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DialogClose>
              </div>
            </div>
            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
              aria-label="More navigation"
            >
              {secondaryItems.map((item) => (
                <NavigationLink
                  key={item.to}
                  item={item}
                  onNavigate={() => onMoreOpenChange(false)}
                />
              ))}
            </nav>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const displayMode = useApplicationDisplayMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isMobile = displayMode === 'mobile-browser' || displayMode === 'installed-mobile';
  const isInstalledMobile = displayMode === 'installed-mobile';
  const navigation = getNavigationForRole(user?.role === 'ADMIN' ? 'ADMIN' : 'CASHIER');
  const primaryOrder = ['/', '/pos', '/invoices', '/products'];
  const primaryItems = navigation
    .filter((item) => item.primary)
    .sort((a, b) => primaryOrder.indexOf(a.to) - primaryOrder.indexOf(b.to));
  const secondaryItems = navigation.filter((item) => !item.primary);
  const activeItem = navigation.find((item) => isNavigationItemActive(location.pathname, item));

  useEffect(() => {
    setDrawerOpen(false);
    setMoreOpen(false);
  }, [displayMode, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="app-shell flex overflow-hidden bg-[var(--color-background)]"
      data-display-mode={displayMode}
    >
      <aside
        className={cn(
          'shrink-0 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)]',
          isMobile ? 'hidden' : 'flex w-[68px] lg:w-[240px]'
        )}
      >
        <div className="flex items-center justify-center gap-3 border-b border-[var(--color-sidebar-border)] px-3 py-4 lg:justify-start lg:px-4">
          <AppLogo size={36} rounded="lg" />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-medium leading-tight text-[var(--color-foreground)]">
              Devi Times
            </p>
            <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">Billing & POS</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 lg:p-3" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavigationLink key={item.to} item={item} compact />
          ))}
        </nav>

        <div className="border-t border-[var(--color-sidebar-border)] p-2 lg:p-3">
          <div className="mb-2 hidden rounded-lg bg-[var(--color-muted)] px-3 py-2.5 lg:block">
            <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{user?.name}</p>
            <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">{user?.role}</p>
          </div>
          <div
            className="mb-2 flex h-10 items-center justify-center rounded-lg bg-[var(--color-muted)] text-sm font-medium text-[var(--color-foreground)] lg:hidden"
            title={`${user?.name ?? ''} (${user?.role ?? ''})`}
          >
            {user?.name?.slice(0, 1).toUpperCase()}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 lg:justify-start"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">Sign out</span>
          </Button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {isMobile ? (
          <header className="mobile-topbar">
            {displayMode === 'mobile-browser' ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            ) : (
              <AppLogo size={30} rounded="lg" />
            )}
            {displayMode === 'mobile-browser' && <AppLogo size={28} rounded="lg" />}
            <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">
              {activeItem?.label ?? 'Devi Times'}
            </p>
            <SyncStatus compact />
            {isInstalledMobile && (
              <NavLink
                to="/profile"
                aria-label="Open profile"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]"
              >
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </NavLink>
            )}
          </header>
        ) : (
          <SyncStatus />
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-6 lg:p-8">
          <div className="page-shell min-w-0">
            <Outlet />
          </div>
        </div>

        {isInstalledMobile && (
          <MobileTabBar
            primaryItems={primaryItems}
            secondaryItems={secondaryItems}
            moreOpen={moreOpen}
            onMoreOpenChange={setMoreOpen}
            pathname={location.pathname}
          />
        )}
      </main>

      {displayMode === 'mobile-browser' && (
        <MobileNavigationDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          items={navigation}
          name={user?.name}
          role={user?.role}
        />
      )}
    </div>
  );
}
