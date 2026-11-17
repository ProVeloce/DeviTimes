import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute, AdminRoute } from '@/components/auth/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { Toaster } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth.store';
import { getPendingMutationCount, syncPendingMutations, useSyncStatus } from '@/lib/offline-sync';

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const PosPage = lazy(() => import('@/pages/PosPage').then((m) => ({ default: m.PosPage })));
const ProductsPage = lazy(() => import('@/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const InvoicesPage = lazy(() => import('@/pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function PageLoader() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function AppRoutes() {
  const token = useAuthStore((s) => s.token);

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/pos" replace /> : <LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
        <Route path="pos" element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
        <Route path="products" element={<Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>} />
        <Route
          path="inventory"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}><InventoryPage /></Suspense>
            </AdminRoute>
          }
        />
        <Route path="invoices" element={<Suspense fallback={<PageLoader />}><InvoicesPage /></Suspense>} />
        <Route path="profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        <Route
          path="reports"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}><UsersPage /></Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="settings"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={token ? '/pos' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    void getPendingMutationCount().catch((error: unknown) => {
      useSyncStatus.getState().set({
        error: error instanceof Error ? error.message : 'Could not load offline changes.',
      });
    });
    const handleOnlineStateChange = async () => {
      const online = navigator.onLine;
      useSyncStatus.getState().set({ online });
      if (online) {
        await syncPendingMutations();
      }
    };

    window.addEventListener('online', handleOnlineStateChange);
    window.addEventListener('offline', handleOnlineStateChange);
    const handleSyncComplete = () => {
      void queryClient.invalidateQueries();
    };
    window.addEventListener('offline-sync-complete', handleSyncComplete);
    void handleOnlineStateChange();

    return () => {
      window.removeEventListener('online', handleOnlineStateChange);
      window.removeEventListener('offline', handleOnlineStateChange);
      window.removeEventListener('offline-sync-complete', handleSyncComplete);
    };
  }, [userId]);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppRoutes />
        <Toaster />
      </HashRouter>
    </QueryClientProvider>
  );
}
