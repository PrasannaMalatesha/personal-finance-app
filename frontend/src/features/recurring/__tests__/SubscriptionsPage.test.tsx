import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { SubscriptionsPage } from '../SubscriptionsPage';
import * as api from '../recurringApi';
import * as authApi from '../../auth/authApi';
import type { RecurringGroupPublic } from '../schemas';

vi.mock('../recurringApi');
vi.mock('../../auth/authApi');

const USER = { id: 'u1', email: 'a@example.com', baseCurrency: 'USD' as const };
const NETFLIX: RecurringGroupPublic = {
  id: '11111111-1111-1111-1111-111111111111',
  merchantKey: 'NETFLIX.COM',
  displayName: 'NETFLIX.COM',
  categoryId: 'c1',
  categoryName: 'Subscriptions',
  categoryColor: '#ab47bc',
  avgAmount: '15.99',
  cadenceDays: 30,
  firstSeen: '2026-05-05',
  lastSeen: '2026-07-05',
  nextExpected: '2026-08-04',
  isDismissed: false,
  txCount: 3,
};

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(USER);
  });

  it('shows empty state when nothing has been detected yet', async () => {
    vi.mocked(api.listRecurring).mockResolvedValue([]);
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText(/no subscriptions detected/i)).toBeInTheDocument();
  });

  it('renders a card per detected group with amount + cadence + category', async () => {
    vi.mocked(api.listRecurring).mockResolvedValue([NETFLIX]);
    renderWithProviders(<SubscriptionsPage />);
    await waitFor(() =>
      expect(screen.getByText('NETFLIX.COM')).toBeInTheDocument(),
    );
    expect(screen.getByText(/15\.99/)).toBeInTheDocument();
    expect(screen.getByText(/Every ~30 days · 3 charges/)).toBeInTheDocument();
    // "Subscriptions" appears both as the page title (h1) and as the
    // category chip on the card — assert both exist.
    expect(screen.getAllByText('Subscriptions').length).toBeGreaterThanOrEqual(2);
  });

  it('Run detection triggers the mutation + surfaces success alert', async () => {
    vi.mocked(api.listRecurring).mockResolvedValue([]);
    vi.mocked(api.runDetection).mockResolvedValue({
      detected: 2,
      updated: 1,
      totalGroups: 3,
    });
    const user = userEvent.setup();

    renderWithProviders(<SubscriptionsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no subscriptions detected/i)).toBeInTheDocument(),
    );

    // Two buttons carry this label: the header CTA + the empty-state CTA.
    // Either kicks off detection — click the first.
    const runButtons = screen.getAllByRole('button', { name: /run detection/i });
    await user.click(runButtons[0]!);
    await waitFor(() => expect(vi.mocked(api.runDetection)).toHaveBeenCalled());
    expect(await screen.findByText(/3 recurring groups/i)).toBeInTheDocument();
  });

  it('confirms then dismisses a group from the row menu', async () => {
    vi.mocked(api.listRecurring).mockResolvedValue([NETFLIX]);
    vi.mocked(api.dismissRecurring).mockResolvedValue({ ...NETFLIX, isDismissed: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<SubscriptionsPage />);
    await waitFor(() => expect(screen.getByText('NETFLIX.COM')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more actions for netflix/i }));
    await user.click(await screen.findByRole('menuitem', { name: /not recurring/i }));

    await waitFor(() =>
      expect(vi.mocked(api.dismissRecurring)).toHaveBeenCalledWith(NETFLIX.id),
    );
  });
});
