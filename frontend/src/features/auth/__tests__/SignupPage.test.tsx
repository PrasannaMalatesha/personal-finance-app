import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from './testUtils';
import { SignupPage } from '../SignupPage';
import * as authApi from '../authApi';

vi.mock('../authApi');

function LocationSpy() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects a password shorter than 8 chars', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupPage />, ['/signup']);
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.tab();
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('submits and navigates to /dashboard on success', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.signup).mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      baseCurrency: 'INR',
    });

    renderWithProviders(
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/dashboard" element={<LocationSpy />} />
      </Routes>,
      ['/signup'],
    );

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(vi.mocked(authApi.signup)).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', password: 'password123' }),
      ),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('shows a duplicate-email error on 409', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../../shared/api/client');
    vi.mocked(authApi.signup).mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Email already exists'),
    );

    renderWithProviders(<SignupPage />, ['/signup']);
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'taken@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});
