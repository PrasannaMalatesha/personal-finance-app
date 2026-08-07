import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { TransactionFormDialog } from '../TransactionFormDialog';
import * as api from '../transactionsApi';
import type { AccountPublic } from '../../accounts/schemas';
import type { CategoryPublic } from '../../categories/categoriesApi';

vi.mock('../transactionsApi');

const ACC: AccountPublic = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Checking',
  type: 'checking',
  openingBalance: '1000.00',
  currentBalance: '1000.00',
  createdAt: '2026-01-01T00:00:00Z',
};
const CAT: CategoryPublic = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  parentCategoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('TransactionFormDialog (create)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects an empty description', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFormDialog
        open
        onClose={() => undefined}
        accounts={[ACC]}
        categories={[CAT]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    // Description AND amount both empty → two "Required" helperTexts.
    const requiredMsgs = await screen.findAllByText(/required/i);
    expect(requiredMsgs.length).toBeGreaterThan(0);
    expect(vi.mocked(api.createTransaction)).not.toHaveBeenCalled();
  });

  it('rejects an amount that isn\'t a signed decimal', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFormDialog
        open
        onClose={() => undefined}
        accounts={[ACC]}
        categories={[CAT]}
      />,
    );
    await user.type(screen.getByLabelText('Description'), 'Bad amount');
    await user.type(screen.getByLabelText('Amount'), 'abc');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByText(/enter an amount/i)).toBeInTheDocument();
    expect(vi.mocked(api.createTransaction)).not.toHaveBeenCalled();
  });

  it('submits with an Idempotency-Key and closes on success', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    vi.mocked(api.createTransaction).mockResolvedValue({
      id: 'tx1',
      accountId: ACC.id,
      date: '2026-07-15',
      description: 'Coffee',
      amount: '-4.50',
      categoryId: CAT.id,
      importBatchId: null,
      createdAt: '2026-07-15T00:00:00Z',
    });

    renderWithProviders(
      <TransactionFormDialog
        open
        onClose={onClose}
        accounts={[ACC]}
        categories={[CAT]}
      />,
    );

    await user.type(screen.getByLabelText('Description'), 'Coffee');
    await user.type(screen.getByLabelText('Amount'), '-4.50');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(vi.mocked(api.createTransaction)).toHaveBeenCalled());
    const call = vi.mocked(api.createTransaction).mock.calls[0]!;
    expect(call[0]).toMatchObject({ accountId: ACC.id, description: 'Coffee', amount: '-4.50' });
    // Idempotency-Key is a UUID
    expect(call[1]).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('TransactionFormDialog (edit)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the delete button and calls deleteTransaction when confirmed', async () => {
    const onClose = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.deleteTransaction).mockResolvedValue();
    const user = userEvent.setup();

    renderWithProviders(
      <TransactionFormDialog
        open
        onClose={onClose}
        accounts={[ACC]}
        categories={[CAT]}
        editing={{
          id: 'tx1',
          accountId: ACC.id,
          date: '2026-07-15',
          description: 'Coffee',
          amount: '-4.50',
          categoryId: CAT.id,
          importBatchId: null,
          createdAt: '2026-07-15T00:00:00Z',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(vi.mocked(api.deleteTransaction)).toHaveBeenCalledWith('tx1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
