import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from './testUtils';
import { ResetPasswordPage } from '../ResetPasswordPage';
import * as authApi from '../authApi';
import { ApiError } from '../../../shared/api/client';

vi.mock('../authApi');

/**
 * Renders the page inside a MemoryRouter set to /reset-password, with
 * ?token= supplied via initialEntries. LoginPage is stubbed so we can
 * assert the post-success redirect landed with the ?reset=success query.
 */
function renderAt(url: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={<div data-testid="login-page" />} />
    </Routes>,
    [url],
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows an error when the URL is missing the token param', async () => {
    renderAt('/reset-password');
    expect(await screen.findByText(/missing reset token/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('rejects a password shorter than 8 chars', async () => {
    const user = userEvent.setup();
    renderAt('/reset-password?token=abc');
    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /set new password/i }));
    // Zod error message is exact; the AuthShell subtitle also mentions "8"
    // — assert the specific validation string, not a substring.
    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument();
    expect(vi.mocked(authApi.resetPassword)).not.toHaveBeenCalled();
  });

  it('submits with token + password and redirects to /login on success', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue();
    const user = userEvent.setup();
    renderAt('/reset-password?token=goodtoken');
    await user.type(screen.getByLabelText(/new password/i), 'freshsecret456');
    await user.click(screen.getByRole('button', { name: /set new password/i }));
    await waitFor(() =>
      expect(vi.mocked(authApi.resetPassword)).toHaveBeenCalledWith({
        token: 'goodtoken',
        newPassword: 'freshsecret456',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument(),
    );
  });

  it('surfaces the invalid-token error on 401 without redirecting', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'nope'),
    );
    const user = userEvent.setup();
    renderAt('/reset-password?token=bad');
    await user.type(screen.getByLabelText(/new password/i), 'freshsecret456');
    await user.click(screen.getByRole('button', { name: /set new password/i }));
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});
