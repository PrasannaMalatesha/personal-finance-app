import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../../app/theme';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactNode,
  initialEntries: MemoryRouterProps['initialEntries'] = ['/'],
): RenderResult & { queryClient: QueryClient } {
  const queryClient = makeClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
