import { apiFetch } from '../../shared/api/client';

export interface PlaidItemPublic {
  id: string;
  institutionName: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface PlaidLinkTokenResult {
  linkToken: string;
  expiration: string;
}

export interface PlaidSyncResult {
  added: number;
  modified: number;
  removed: number;
  accountsUpserted: number;
}

interface OneResponse<T> {
  data: T;
}
interface ListResponse<T> {
  data: T[];
}

export async function createLinkToken(): Promise<PlaidLinkTokenResult> {
  const res = await apiFetch<OneResponse<PlaidLinkTokenResult>>('/api/v1/plaid/link_token', {
    method: 'POST',
    json: {},
  });
  return res.data;
}

export async function exchangePublicToken(publicToken: string): Promise<PlaidItemPublic> {
  const res = await apiFetch<OneResponse<PlaidItemPublic>>('/api/v1/plaid/exchange', {
    method: 'POST',
    json: { publicToken },
  });
  return res.data;
}

export async function listItems(): Promise<PlaidItemPublic[]> {
  const res = await apiFetch<ListResponse<PlaidItemPublic>>('/api/v1/plaid/items');
  return res.data;
}

export async function syncItem(id: string): Promise<PlaidSyncResult> {
  const res = await apiFetch<OneResponse<PlaidSyncResult>>(
    `/api/v1/plaid/items/${id}/sync`,
    { method: 'POST', json: {} },
  );
  return res.data;
}
