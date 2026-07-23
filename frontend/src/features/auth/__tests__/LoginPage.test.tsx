import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from './testUtils';
import { LoginPage } from '../LoginPage';
import * as authApi from '../authApi';

vi.mock('../authApi');

function LocationSpy() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the form fields', () => {
    renderWithProviders(<LoginPage />, ['/login']);
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('shows a validation error for an invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, ['/login']);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'not-an-email');
    await user.tab(); // blur triggers Zod validation
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
  });

  it('submits and navigates to /dashboard on success', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      baseCurrency: 'USD',
    });

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<LocationSpy />} />
      </Routes>,
      ['/login'],
    );

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() =>
      expect(vi.mocked(authApi.login)).toHaveBeenCalledWith({
        email: 'a@example.com',
        password: 'password123',
      }),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('surfaces a friendly message on 401', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../../shared/api/client');
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'Invalid credentials'),
    );

    renderWithProviders(<LoginPage />, ['/login']);
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(
      await screen.findByText(/email or password is incorrect/i),
    ).toBeInTheDocument();
  });
});
