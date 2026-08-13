import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { UploadStep } from '../UploadStep';
import * as importsApi from '../importsApi';
import * as accountsApi from '../../accounts/accountsApi';

vi.mock('../importsApi');
vi.mock('../../accounts/accountsApi');

const ACC = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Chase Checking',
  type: 'checking' as const,
  currency: 'USD' as const,
  openingBalance: '0.00',
  currentBalance: '0.00',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('UploadStep', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(accountsApi.listAccounts).mockResolvedValue([ACC]);
  });

  it('disables Continue until account + file are chosen', async () => {
    renderWithProviders(<UploadStep onPreview={() => undefined} />);
    const button = await screen.findByRole('button', { name: /continue/i });
    expect(button).toBeDisabled();
  });

  it('rejects a non-CSV file', async () => {
    renderWithProviders(<UploadStep onPreview={() => undefined} />);
    await screen.findByRole('combobox');

    // Hidden file inputs are not interactable via user-event in jsdom;
    // fireEvent.change goes around that.
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const bad = new File(['nope'], 'evil.exe', { type: 'application/x-msdownload' });
    fireEvent.change(fileInput, { target: { files: [bad] } });

    expect(await screen.findByText(/only csv files are supported/i)).toBeInTheDocument();
  });

  it('calls previewImport and forwards the result on Continue', async () => {
    const user = userEvent.setup();
    const previewResult = {
      detectedColumns: {
        presetName: 'generic',
        date: 'Date',
        description: 'Description',
        amount: 'Amount',
        debit: null,
        credit: null,
        amountKind: 'signed' as const,
      },
      rows: [
        {
          index: 0,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
          proposedCategoryId: null,
          proposedCategoryName: null,
          matchedRuleId: null,
          isDuplicate: false,
          duplicateOfTransactionId: null,
        },
      ],
      previewToken: 'tok',
      expiresInSec: 300,
    };
    vi.mocked(importsApi.previewImport).mockResolvedValue(previewResult);

    const onPreview = vi.fn();
    renderWithProviders(<UploadStep onPreview={onPreview} />);

    // Pick account
    const combo = await screen.findByRole('combobox');
    await user.click(combo);
    const option = await screen.findByRole('option', { name: /chase checking/i });
    await user.click(option);

    // Attach file
    const csv = new File(['Date,Description,Amount\n2026-07-15,x,-1.00'], 'sample.csv', {
      type: 'text/csv',
    });
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [csv] } });

    // Continue
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(vi.mocked(importsApi.previewImport)).toHaveBeenCalled());
    const [accountId, fileArg] = vi.mocked(importsApi.previewImport).mock.calls[0]!;
    expect(accountId).toBe(ACC.id);
    expect(fileArg.name).toBe('sample.csv');

    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(
        previewResult,
        expect.objectContaining({ accountId: ACC.id, filename: 'sample.csv' }),
      ),
    );
  });
});
