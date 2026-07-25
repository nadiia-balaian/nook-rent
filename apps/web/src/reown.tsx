import { createAppKit } from '@reown/appkit/react';
import { mainnet } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID?.trim();
const networks: [typeof mainnet] = [mainnet];
const queryClient = new QueryClient();

const wagmiAdapter = projectId
  ? Object.assign(
      new WagmiAdapter({
        networks,
        projectId,
        ssr: false,
      }),
      {
        namespace: 'eip155' as const,
        adapterType: 'wagmi',
      },
    )
  : undefined;

if (projectId && wagmiAdapter) {
  const origin =
    typeof window === 'undefined' ? 'https://nook-rent-web.vercel.app' : window.location.origin;

  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata: {
      name: 'Nook.rent',
      description: 'P2P sublet marketplace for digital nomads',
      url: origin,
      icons: [],
    },
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
  });
}

export const reownConfigured = Boolean(wagmiAdapter);

export function ReownProvider({ children }: { children: ReactNode }) {
  if (!wagmiAdapter) {
    return children;
  }

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
