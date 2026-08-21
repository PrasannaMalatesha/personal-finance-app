import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AppShell } from '../shared/components/AppShell';
import { AppErrorBoundary } from '../shared/components/AppErrorBoundary';
import { PageError } from '../shared/components/PageError';
import { HealthPage } from '../features/health/HealthPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { ImportsPage } from '../features/imports/ImportsPage';
import { NewImportPage } from '../features/imports/NewImportPage';
import { BudgetsPage } from '../features/budgets/BudgetsPage';
import { RulesPage } from '../features/rules/RulesPage';
import { SubscriptionsPage } from '../features/recurring/SubscriptionsPage';
import { CategoriesPage } from '../features/categories/CategoriesPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { flags } from '../flags';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';

// Recharts is heavy (~400KB) and only used on the dashboard. Split it into
// its own chunk so login/signup/other pages don't pay for it up front.
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
);

function RouteFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={28} />
    </Box>
  );
}

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
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            element: (
              <Suspense fallback={<RouteFallback />}>
                <DashboardPage />
              </Suspense>
            ),
          },
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
