import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, ShoppingBag, Package, AlertTriangle, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { DashboardStats } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';

function StatCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">{title}</p>
          <p className="mt-1 text-2xl font-medium tracking-tight">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            accent ? 'bg-[var(--color-brand-muted)] text-[#1967d2]' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardStats>('/dashboard/stats'),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const message = error instanceof ApiError
      ? error.message
      : 'Check your connection and try again.';

    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Business overview for Devi Times"
        />
        <Card>
          <CardContent role="alert" className="flex flex-col items-start gap-3 p-6">
            <div>
              <p className="font-medium">Dashboard data couldn’t be loaded</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{message}</p>
            </div>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'Retrying…' : 'Try again'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Business overview for Devi Times"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Today Sales" value={formatCurrency(stats.todaySales)} icon={TrendingUp} accent />
        <StatCard title="Monthly Sales" value={formatCurrency(stats.monthlySales)} icon={ShoppingBag} />
        <StatCard title="Total Orders" value={String(stats.totalOrders)} icon={Package} />
        <StatCard title="Est. Profit (Month)" value={formatCurrency(stats.profit)} icon={TrendingUp} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent className="h-64 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.salesChart}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a73e8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1a73e8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dadce0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 10 }}
                  stroke="#5f6368"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="#5f6368" />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), 'Sales']}
                  labelFormatter={(l) => l}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#1a73e8"
                  fill="url(#salesGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-auto">
            {stats.lowStockAlerts.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">All stock levels healthy</p>
            ) : (
              stats.lowStockAlerts.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-[var(--color-muted)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="text-[10px] text-[var(--color-muted-foreground)]">
                      {item.code}
                      {item.variant ? ` · ${item.variant}` : ''}
                    </p>
                  </div>
                  <Badge variant="warning">{item.stock} left</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.topProducts.map((p) => (
              <div
                key={p.code}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">{p.code}</p>
                </div>
                <span className="text-sm font-medium text-[#1967d2]">{p.quantitySold} sold</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentTransactions.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-[10px] text-[var(--color-muted-foreground)]">
                    {formatDateTime(inv.createdAt)}
                  </p>
                </div>
                <span className="text-sm font-bold">{formatCurrency(Number(inv.grandTotal))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
