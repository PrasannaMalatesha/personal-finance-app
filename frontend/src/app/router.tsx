import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AppShell } from '../shared/components/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HealthPage } from '../features/health/HealthPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { ImportsPage } from '../features/imports/ImportsPage';
import { NewImportPage } from '../features/imports/NewImportPage';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';

const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
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
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'imports', element: <ImportsPage /> },
          { path: 'imports/new', element: <NewImportPage /> },
          { path: 'health', element: <HealthPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
