import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';

function FullPageSpinner() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="status"
      aria-label="Loading"
    >
      <CircularProgress size={28} />
    </Box>
  );
}

/**
 * Gates authenticated routes. During the initial /me fetch we show a full-page
 * spinner rather than flashing the login page — an already-signed-in user
 * hard-refreshing the app should not glimpse /login before we know their state.
 */
export function ProtectedRoute() {
  const { user, isPending } = useAuth();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/**
 * Inverse guard for /login and /signup. If the user is already signed in we
 * bounce them to the dashboard — no reason to show the auth pages twice.
 */
export function PublicOnlyRoute() {
  const { user, isPending } = useAuth();
  if (isPending) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
