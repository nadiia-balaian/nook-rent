// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WalletAccountMenu, WalletEvidencePanel } from './WalletEvidencePanel.js';
import type { WalletEvidence } from './api.js';

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: vi.fn() }),
  useAppKitAccount: () => ({
    address: '0x1111111111111111111111111111111111111111',
    isConnected: true,
  }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
}));

vi.mock('wagmi', () => ({
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
}));

vi.mock('./reown.js', () => ({
  reownConfigured: true,
}));

afterEach(() => {
  cleanup();
});

describe('Wallet evidence panel', () => {
  const evidence: WalletEvidence = {
    provider: 'poap_compass',
    walletControl: {
      verified: true,
      address: '0x1111111111111111111111111111111111111111',
      verifiedAt: '2026-07-26T00:00:01.000Z',
    },
    signals: {
      totalPoaps: 2,
      distinctEvents: 2,
      activeYears: [2025, 2026],
      tokensWithRecordedTransfers: 0,
      totalRecordedTransfers: 0,
    },
    recentPoaps: [],
    truncated: false,
    theGraph: {
      provider: 'the_graph',
      dataset: 'ens',
      network: 'ethereum',
      subgraphId: '5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH',
      sourceRef: 'the-graph:ens:ethereum:5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH',
      ownedNames: ['nook.eth'],
      truncated: false,
    },
  };

  it('shows ENS data from The Graph separately from POAP Compass data', () => {
    render(<WalletEvidencePanel evidence={evidence} onClear={vi.fn()} onEvidence={vi.fn()} />);

    expect(screen.getByText('nook.eth')).toBeTruthy();
    expect(screen.getByText('The Graph · ENS mainnet')).toBeTruthy();
    expect(screen.getAllByText('2', { selector: 'strong' })).toHaveLength(2);
    expect(screen.getByText('Live sources · The Graph ENS · POAP Compass')).toBeTruthy();
  });

  it('puts ENS and POAP evidence behind the upper-right Account control', async () => {
    const user = userEvent.setup();

    render(
      <>
        <WalletAccountMenu evidence={evidence} onClear={vi.fn()} onEvidence={vi.fn()} />
        <button type="button">Outside account menu</button>
      </>,
    );

    expect(screen.getByRole('button', { name: /nook\.eth\s*2 POAPs/ })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Account information' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /nook\.eth\s*2 POAPs/ }));

    expect(screen.getByRole('dialog', { name: 'Account information' })).toBeTruthy();
    expect(screen.getByText('The Graph · ENS mainnet')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Outside account menu' }));

    expect(screen.queryByRole('dialog', { name: 'Account information' })).toBeNull();
  });
});
