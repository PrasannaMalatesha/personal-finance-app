import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AppShell } from '../shared/components/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HealthPage } from '../features/health/HealthPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'health', element: <HealthPage /> },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
