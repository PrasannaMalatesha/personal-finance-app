import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { DashboardPage } from '../DashboardPage';
import * as dashboardApi from '../dashboardApi';
import * as accountsApi from '../../accounts/accountsApi';
import * as authApi from '../../auth/authApi';

vi.mock('../dashboardApi');
vi.mock('../../accounts/accountsApi');
vi.mock('../../auth/authApi');

const USER = { id: 'u1', email: 'a@example.com', baseCurrency: 'USD' as const };
const ACC = {
  id: 'acc1',
  name: 'Checking',
  type: 'checking' as const,
  openingBalance: '1000.00',
  currentBalance: '1000.00',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(USER);
  });

  it('shows the "Add your first account" empty state when there are none', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
    vi.mocked(dashboardApi.getSummary).mockResolvedValue({
      month: '2026-07',
      income: '0.00',
      expenses: '0.00',
      net: '0.00',
      budgetTotalLimit: '0.00',
      budgetTotalSpent: '0.00',
      budgetPercentUsed: 0,
    });
    vi.mocked(dashboardApi.getByCategory).mockResolvedValue([]);
    vi.mocked(dashboardApi.getTrend).mockResolvedValue([]);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/add your first account/i)).toBeInTheDocument();
  });

  it('renders summary, category slices, and trend when data is present', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([ACC]);
    vi.mocked(dashboardApi.getSummary).mockResolvedValue({
      month: '2026-07',
      income: '2000.00',
      expenses: '470.00',
      net: '1530.00',
      budgetTotalLimit: '1000.00',
      budgetTotalSpent: '470.00',
      budgetPercentUsed: 47,
    });
    vi.mocked(dashboardApi.getByCategory).mockResolvedValue([
      { categoryId: 'c1', categoryName: 'Groceries', color: '#4caf50', amount: '350.00' },
      { categoryId: 'c2', categoryName: 'Dining', color: '#e57373', amount: '120.00' },
    ]);
    vi.mocked(dashboardApi.getTrend).mockResolvedValue([
      { month: '2026-02', income: '2000.00', expenses: '100.00' },
      { month: '2026-03', income: '2000.00', expenses: '200.00' },
      { month: '2026-04', income: '2000.00', expenses: '150.00' },
      { month: '2026-05', income: '2000.00', expenses: '300.00' },
      { month: '2026-06', income: '2000.00', expenses: '400.00' },
      { month: '2026-07', income: '2000.00', expenses: '470.00' },
    ]);

    renderWithProviders(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText(/47% used/i)).toBeInTheDocument(),
    );
    // Summary card headline: "$470.00 of $1,000.00" — plus other places
    // ($470 also appears as an "Expenses" stat), so just assert presence.
    expect(screen.getAllByText(/470\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1,000\.00/)).toBeInTheDocument();
    // Category legend entries
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
    // Trend section header renders
    expect(screen.getByText(/6-month trend/i)).toBeInTheDocument();
  });

  it('shows empty-chart copy when no expenses this month', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([ACC]);
    vi.mocked(dashboardApi.getSummary).mockResolvedValue({
      month: '2026-07',
      income: '0.00',
      expenses: '0.00',
      net: '0.00',
      budgetTotalLimit: '0.00',
      budgetTotalSpent: '0.00',
      budgetPercentUsed: 0,
    });
    vi.mocked(dashboardApi.getByCategory).mockResolvedValue([]);
    vi.mocked(dashboardApi.getTrend).mockResolvedValue([
      { month: '2026-07', income: '0.00', expenses: '0.00' },
    ]);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/no expenses yet this month/i)).toBeInTheDocument();
    expect(screen.getByText(/add a few months of transactions/i)).toBeInTheDocument();
  });
});
