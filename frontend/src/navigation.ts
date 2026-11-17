import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  UserRound,
  UsersRound,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

export type NavigationRole = 'ADMIN' | 'CASHIER';

export interface NavigationItem {
  to: string;
  icon: LucideIcon;
  label: string;
  roles: readonly NavigationRole[];
  primary?: boolean;
  end?: boolean;
}

const allRoles: readonly NavigationRole[] = ['ADMIN', 'CASHIER'];
const adminsOnly: readonly NavigationRole[] = ['ADMIN'];

export const navigationItems: readonly NavigationItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: allRoles, primary: true, end: true },
  { to: '/pos', icon: ShoppingCart, label: 'Billing', roles: allRoles, primary: true },
  { to: '/products', icon: Package, label: 'Products', roles: allRoles, primary: true },
  { to: '/inventory', icon: Warehouse, label: 'Inventory', roles: adminsOnly },
  { to: '/invoices', icon: FileText, label: 'Invoices', roles: allRoles, primary: true },
  { to: '/profile', icon: UserRound, label: 'Profile', roles: allRoles },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: adminsOnly },
  { to: '/users', icon: UsersRound, label: 'Manage Users', roles: adminsOnly },
  { to: '/settings', icon: Settings, label: 'Settings', roles: adminsOnly },
];

export function getNavigationForRole(role: NavigationRole): NavigationItem[] {
  return navigationItems.filter((item) => item.roles.includes(role));
}

export function isNavigationItemActive(pathname: string, item: NavigationItem): boolean {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
