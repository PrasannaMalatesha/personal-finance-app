import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ flexGrow: 1, color: 'inherit', textDecoration: 'none' }}
          >
            Personal Finance
          </Typography>
          <Button color="inherit" component={RouterLink} to="/dashboard">
            Dashboard
          </Button>
          <Button color="inherit" component={RouterLink} to="/health">
            Health
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
