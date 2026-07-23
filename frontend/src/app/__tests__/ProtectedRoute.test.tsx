import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../features/auth/__tests__/testUtils';
import { ProtectedRoute, PublicOnlyRoute } from '../ProtectedRoute';
import * as authApi from '../../features/auth/authApi';
import { ApiError } from '../../shared/api/client';

vi.mock('../../features/auth/authApi');

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirects an unauthed user to /login', async () => {
    // 401 → useAuth resolves to user: null
    vi.mocked(authApi.me).mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'not logged in'),
    );

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/private" element={<div>secret</div>} />
        </Route>
        <Route path="/login" element={<div>login page</div>} />
      </Routes>,
      ['/private'],
    );

    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
  });

  it('renders the protected child when authed', async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      baseCurrency: 'USD',
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/private" element={<div>secret</div>} />
        </Route>
        <Route path="/login" element={<div>login page</div>} />
      </Routes>,
      ['/private'],
    );

    await waitFor(() => expect(screen.getByText('secret')).toBeInTheDocument());
  });
});

describe('PublicOnlyRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('bounces an authed user away from /login', async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      baseCurrency: 'USD',
    });

    renderWithProviders(
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>login page</div>} />
        </Route>
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>,
      ['/login'],
    );

    await waitFor(() => expect(screen.getByText('dashboard')).toBeInTheDocument());
  });
});
