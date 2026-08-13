import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';

/**
 * Thin abstraction over the Plaid SDK — trims the surface we depend on to a
 * handful of methods, and lets tests swap in an in-memory fake without
 * touching the SDK client.
 *
 * All amounts and dates are passed through unchanged; conversion to our
 * NUMERIC/DATE column types happens in the service.
 */
export interface PlaidAccountRaw {
  account_id: string;
  name: string;
  official_name?: string | null;
  type: string;
  subtype: string | null;
  mask?: string | null;
  balances: {
    available: number | null;
    current: number | null;
    iso_currency_code: string | null;
  };
}

export interface PlaidTransactionRaw {
  transaction_id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  name: string;
  merchant_name?: string | null;
  amount: number; // Plaid: positive = outflow, negative = inflow
  iso_currency_code: string | null;
  pending: boolean;
}

export interface PlaidLinkTokenInput {
  userId: string;
  clientName: string;
  language?: string;
  countryCodes?: string[];
}

export interface PlaidAdapter {
  createLinkToken(input: PlaidLinkTokenInput): Promise<{ linkToken: string; expiration: string }>;
  exchangePublicToken(publicToken: string): Promise<{ itemId: string; accessToken: string }>;
  getItem(accessToken: string): Promise<{ institutionId: string | null; institutionName: string | null }>;
  getAccounts(accessToken: string): Promise<PlaidAccountRaw[]>;
  syncTransactions(
    accessToken: string,
    cursor: string | null,
  ): Promise<{
    added: PlaidTransactionRaw[];
    modified: PlaidTransactionRaw[];
    removed: Array<{ transaction_id: string }>;
    nextCursor: string;
    hasMore: boolean;
  }>;
}

export interface PlaidAdapterConfig {
  clientId: string;
  secret: string;
  env: 'sandbox' | 'development' | 'production';
}

export function createPlaidAdapter(config: PlaidAdapterConfig): PlaidAdapter {
  const client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[config.env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': config.clientId,
          'PLAID-SECRET': config.secret,
        },
      },
    }),
  );

  return {
    async createLinkToken({ userId, clientName, language = 'en', countryCodes = ['US'] }) {
      const res = await client.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: clientName,
        // Transactions is all we need for the demo; wider product access can
        // be added by the user by regenerating with more entries here.
        products: [Products.Transactions],
        country_codes: countryCodes.map((c) => c as CountryCode),
        language,
      });
      return { linkToken: res.data.link_token, expiration: res.data.expiration };
    },

    async exchangePublicToken(publicToken) {
      const res = await client.itemPublicTokenExchange({ public_token: publicToken });
      return { itemId: res.data.item_id, accessToken: res.data.access_token };
    },

    async getItem(accessToken) {
      const itemRes = await client.itemGet({ access_token: accessToken });
      const institutionId = itemRes.data.item.institution_id ?? null;
      if (!institutionId) return { institutionId: null, institutionName: null };
      try {
        const instRes = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        return { institutionId, institutionName: instRes.data.institution.name };
      } catch {
        // Institution metadata lookup failing shouldn't block link/exchange.
        return { institutionId, institutionName: null };
      }
    },

    async getAccounts(accessToken) {
      const res = await client.accountsGet({ access_token: accessToken });
      return res.data.accounts as unknown as PlaidAccountRaw[];
    },

    async syncTransactions(accessToken, cursor) {
      const res = await client.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? undefined,
      });
      return {
        added: res.data.added as unknown as PlaidTransactionRaw[],
        modified: res.data.modified as unknown as PlaidTransactionRaw[],
        removed: res.data.removed as unknown as Array<{ transaction_id: string }>,
        nextCursor: res.data.next_cursor,
        hasMore: res.data.has_more,
      };
    },
  };
}
