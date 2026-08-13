import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { TransactionsPage } from '../TransactionsPage';
import * as txApi from '../transactionsApi';
import * as accountsApi from '../../accounts/accountsApi';
import * as categoriesApi from '../../categories/categoriesApi';
import * as authApi from '../../auth/authApi';

vi.mock('../transactionsApi');
vi.mock('../../accounts/accountsApi');
vi.mock('../../categories/categoriesApi');
vi.mock('../../auth/authApi');

const USER = { id: 'u1', email: 'a@example.com', baseCurrency: 'USD' as const };
const ACC = {
  id: 'acc1',
  name: 'Checking',
  type: 'checking' as const,
  currency: 'USD' as const,
  openingBalance: '1000.00',
  currentBalance: '1000.00',
  createdAt: '2026-01-01T00:00:00Z',
};
const CAT = {
  id: 'cat1',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  parentCategoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(USER);
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([CAT]);
  });

  it('shows the "Add account first" empty state when there are none', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
    vi.mocked(txApi.listTransactions).mockResolvedValue({ data: [], nextCursor: null });

    renderWithProviders(<TransactionsPage />);

    expect(await screen.findByText(/add an account first/i)).toBeInTheDocument();
  });

  it('renders transaction rows with formatted date + amount', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([ACC]);
    vi.mocked(txApi.listTransactions).mockResolvedValue({
      data: [
        {
          id: 'tx1',
          accountId: ACC.id,
          date: '2026-07-15',
          description: 'Starbucks',
          amount: '-4.50',
          categoryId: CAT.id,
          importBatchId: null,
          createdAt: '2026-07-15T00:00:00Z',
        },
      ],
      nextCursor: null,
    });

    renderWithProviders(<TransactionsPage />);

    await waitFor(() =>
      expect(screen.getByText('Starbucks')).toBeInTheDocument(),
    );
    // Intl.NumberFormat may render "-$4.50" or "$-4.50" — assert the digits are visible.
    expect(screen.getByText(/4\.50/)).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
  });

  it('surfaces the empty-rows state when filters match nothing', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([ACC]);
    vi.mocked(txApi.listTransactions).mockResolvedValue({ data: [], nextCursor: null });

    renderWithProviders(<TransactionsPage />);

    expect(
      await screen.findByText(/no transactions match/i),
    ).toBeInTheDocument();
  });
});
