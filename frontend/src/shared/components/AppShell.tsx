import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { Link as RouterLink, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { brand } from '../../app/theme';
import { useAuth, useLogout } from '../../features/auth/useAuth';

// /health is intentionally omitted — it's a debug page reachable by URL
// but kept out of the primary nav to prevent overflow on standard laptop
// widths. Everything a user needs day-to-day is in the visible list.
const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/imports', label: 'Imports' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/rules', label: 'Rules' },
];

function BrandMark() {
  return (
    <Box
      component={RouterLink}
      to="/"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        textDecoration: 'none',
        color: 'inherit',
      }}
      aria-label="Personal Finance home"
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.5,
          background: `linear-gradient(135deg, ${brand.teal[500]}, ${brand.teal[700]})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
        }}
        aria-hidden
      >
        ₹
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Personal Finance
      </Typography>
    </Box>
  );
}

function initialsFor(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return chars.toUpperCase() || (local[0]?.toUpperCase() ?? '?');
}

function UserMenu({ email }: { email: string }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const close = () => setAnchor(null);
  const onLogout = async () => {
    close();
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        size="small"
        aria-label="Open account menu"
        aria-haspopup="true"
        sx={{ p: 0.5 }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: brand.teal[500],
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {initialsFor(email)}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Signed in as
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
            {email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={onLogout} disabled={logout.isPending}>
          <LogoutIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} />
          {logout.isPending ? 'Logging out…' : 'Log out'}
        </MenuItem>
      </Menu>
    </>
  );
}

export function AppShell() {
  const { user } = useAuth();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 3 }}>
          <BrandMark />
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1 }}>
            {NAV.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                size="small"
                sx={{
                  color: 'text.secondary',
                  '&.active': { color: 'primary.main', backgroundColor: 'transparent' },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          {user ? <UserMenu email={user.email} /> : null}
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
