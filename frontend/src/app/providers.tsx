import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { ColorModeProvider } from './ColorModeContext';
import { useColorMode } from './useColorMode';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// Toaster reads the color mode so its own theme swaps in lockstep with the app.
// Kept inside ColorModeProvider so useColorMode is available.
function ThemedToaster() {
  const { mode } = useColorMode();
  return (
    <Toaster
      theme={mode}
      position="bottom-right"
      richColors
      closeButton
      // Sonner's own defaults are tasteful; overriding here would defeat
      // the point of using it. Duration = 5s stays under the "long enough
      // to notice, short enough not to nag" band Emil cites.
      duration={5000}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ColorModeProvider>
        {children}
        <ThemedToaster />
      </ColorModeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
