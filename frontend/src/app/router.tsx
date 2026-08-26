import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AppShell } from '../shared/components/AppShell';
import { AppErrorBoundary } from '../shared/components/AppErrorBoundary';
import { PageError } from '../shared/components/PageError';
import { HealthPage } from '../features/health/HealthPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { flags } from '../flags';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';

// Lazy-load a page by its named export. Vite still splits each page into its
// own chunk because the `import()` path stays a literal at the call site — the
// loader just flows through this helper. Keeps the big feature pages (and
// recharts, which only the dashboard uses) out of the initial bundle. Auth
// pages stay eager above: they're the first paint and must not flash a loader.
function lazyPage<T, K extends keyof T>(loader: () => Promise<T>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

const DashboardPage = lazyPage(() => import('../features/dashboard/DashboardPage'), 'DashboardPage');
const AccountsPage = lazyPage(() => import('../features/accounts/AccountsPage'), 'AccountsPage');
const TransactionsPage = lazyPage(() => import('../features/transactions/TransactionsPage'), 'TransactionsPage');
const ImportsPage = lazyPage(() => import('../features/imports/ImportsPage'), 'ImportsPage');
const NewImportPage = lazyPage(() => import('../features/imports/NewImportPage'), 'NewImportPage');
const BudgetsPage = lazyPage(() => import('../features/budgets/BudgetsPage'), 'BudgetsPage');
const RulesPage = lazyPage(() => import('../features/rules/RulesPage'), 'RulesPage');
const SubscriptionsPage = lazyPage(() => import('../features/recurring/SubscriptionsPage'), 'SubscriptionsPage');
const CategoriesPage = lazyPage(() => import('../features/categories/CategoriesPage'), 'CategoriesPage');
const SettingsPage = lazyPage(() => import('../features/settings/SettingsPage'), 'SettingsPage');

const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      // Public-only routes — signed-in users get redirected to /dashboard.
      // Only registered when the flag is on so the URLs 404 cleanly otherwise.
      ...(flags.passwordReset
        ? [
            { path: '/forgot-password', element: <ForgotPasswordPage /> },
            { path: '/reset-password', element: <ResetPasswordPage /> },
          ]
        : []),
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        // AppShell wraps its <Outlet /> in a single Suspense boundary, so the
        // lazy pages below share one route-transition fallback.
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'imports', element: <ImportsPage /> },
          { path: 'imports/new', element: <NewImportPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'rules', element: <RulesPage /> },
          // v2 feature — route only registered when the flag is on so it
          // 404s cleanly when disabled. Matches the backend router mount.
          ...(flags.recurringDetection
            ? [{ path: 'subscriptions', element: <SubscriptionsPage /> }]
            : []),
          ...(flags.hierarchicalCategories
            ? [{ path: 'categories', element: <CategoriesPage /> }]
            : []),
          { path: 'settings', element: <SettingsPage /> },
          { path: 'health', element: <HealthPage /> },
        ],
      },
    ],
  },
  // Anything unmatched: friendly 404 rather than a silent redirect.
  { path: '*', element: <PageError variant="not-found" /> },
]);

export function Router() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  );
}
