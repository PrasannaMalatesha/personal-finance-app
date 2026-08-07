import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './testUtils';
import { ForgotPasswordPage } from '../ForgotPasswordPage';
import * as authApi from '../authApi';

vi.mock('../authApi');

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects an empty email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />);
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(vi.mocked(authApi.requestPasswordReset)).not.toHaveBeenCalled();
  });

  it('rejects an invalid email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it('submits + shows success message when the API resolves', async () => {
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue();
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText(/email/i), 'demo@finance.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() =>
      expect(vi.mocked(authApi.requestPasswordReset)).toHaveBeenCalledWith('demo@finance.app'),
    );
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    // Same success view for unknown addresses too (no user enumeration) —
    // covered by the backend test suite.
    expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
  });
});
