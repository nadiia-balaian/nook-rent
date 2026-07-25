// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import type { BookingQuote, DepositResult, Listing, ReservationResult } from './api.js';

const listing: Listing = {
  id: '30000000-0000-4000-8000-000000000001',
  hostProfileId: '10000000-0000-4000-8000-000000000001',
  title: 'Calm Alfama room near the river',
  description: 'A bright room with a desk, fast Wi-Fi, and a quiet courtyard.',
  city: 'Lisbon',
  neighborhood: 'Alfama',
  approximateLocationRef: 'lisbon-alfama-demo-area',
  amenities: ['wifi', 'desk'],
  houseRules: ['No smoking'],
  settlementTokenId: '0.0.12345',
  nightlyRateAtomic: '10000',
  baseDepositAtomic: '50000',
  maxGuests: 2,
  status: 'published',
  createdAt: '2026-07-25T10:00:00.000Z',
  updatedAt: '2026-07-25T10:00:00.000Z',
};

const quote: BookingQuote = {
  id: '40000000-0000-4000-8000-000000000001',
  listingId: listing.id,
  guestProfileId: '20000000-0000-4000-8000-000000000001',
  checkIn: '2026-08-20',
  checkOut: '2026-08-25',
  nights: 5,
  settlementTokenId: '0.0.12345',
  nightlyRateAtomic: '10000',
  staySubtotalAtomic: '50000',
  baseDepositAtomic: '50000',
  quotedDepositAtomic: '50000',
  totalDueAtomic: '100000',
  reputationTier: 'silver',
  expiresAt: '2099-08-20T10:15:00.000Z',
  createdAt: '2026-07-25T10:00:00.000Z',
};

function reservation(mode: 'automatic' | 'manual'): ReservationResult {
  const manual = mode === 'manual';

  return {
    status: 'created',
    hold: {
      id: '50000000-0000-4000-8000-000000000001',
      listingId: listing.id,
      guestProfileId: manual ? '20000000-0000-4000-8000-000000000002' : quote.guestProfileId,
      quoteId: quote.id,
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights,
      status: 'active',
      expiresAt: '2099-08-20T10:15:00.000Z',
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T10:00:00.000Z',
    },
    bookingRequest: {
      id: '60000000-0000-4000-8000-000000000001',
      holdId: '50000000-0000-4000-8000-000000000001',
      listingId: listing.id,
      guestProfileId: manual ? '20000000-0000-4000-8000-000000000002' : quote.guestProfileId,
      approvalResult: manual ? 'host_review' : 'auto_approved',
      policyVersion: 1,
      status: manual ? 'pending' : 'approved',
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T10:00:00.000Z',
    },
    booking: {
      id: '70000000-0000-4000-8000-000000000001',
      listingId: listing.id,
      hostProfileId: listing.hostProfileId,
      guestProfileId: manual ? '20000000-0000-4000-8000-000000000002' : quote.guestProfileId,
      quoteId: quote.id,
      holdId: '50000000-0000-4000-8000-000000000001',
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights,
      settlementTokenId: quote.settlementTokenId,
      staySubtotalAtomic: quote.staySubtotalAtomic,
      depositAmountAtomic: quote.quotedDepositAtomic,
      status: manual ? 'approval_pending' : 'awaiting_deposit',
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T10:00:00.000Z',
    },
    approval: manual
      ? {
          status: 'host_review',
          reason: 'rental_reputation_below_minimum',
        }
      : { status: 'auto_approved' },
    authorization: {
      provider: 'world_agentkit',
      humanBacked: true,
    },
    onchainSignal: {
      provider: 'the_graph',
      subgraph: 'agent0',
      network: 'base-sepolia',
      chainId: 84_532,
      subgraphId: '4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u',
      sourceRef: 'the-graph:agent0:base-sepolia:4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u',
      registered: true,
      active: true,
      binding: 'agent_wallet',
      requiredCapability: 'nook.rent:reservation-hold',
      capabilityPresent: true,
    },
  };
}

function confirmedDeposit(initialReservation: ReservationResult): DepositResult {
  return {
    idempotent: false,
    operation: {
      id: '80000000-0000-4000-8000-000000000001',
      status: 'confirmed',
      transactionId: '0.0.1001@1784980800.000000001',
      transactionUrl: 'https://hashscan.io/testnet/transaction/0.0.1001%401784980800.000000001',
      attemptCount: 1,
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T10:00:02.000Z',
    },
    escrow: {
      id: '90000000-0000-4000-8000-000000000001',
      tokenId: quote.settlementTokenId,
      amountAtomic: quote.quotedDepositAtomic,
      status: 'funded',
      fundedTransactionId: '0.0.1001@1784980800.000000001',
    },
    payment: {
      id: '91000000-0000-4000-8000-000000000001',
      tokenId: quote.settlementTokenId,
      amountAtomic: quote.quotedDepositAtomic,
      status: 'confirmed',
    },
    booking: {
      ...initialReservation.booking,
      status: 'confirmed',
    },
    hold: {
      ...initialReservation.hold,
      status: 'converted',
    },
    evidence: {
      status: 'confirmed',
      transactionId: '0.0.1001@1784980801.000000001',
      transactionUrl: 'https://hashscan.io/testnet/transaction/0.0.1001%401784980801.000000001',
      sequenceNumber: 14,
      topicId: '0.0.8001',
      topicUrl: 'https://hashscan.io/testnet/topic/0.0.8001',
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installMarketplaceApi(
  mode: 'automatic' | 'manual',
  options: { requireWorldAgent?: boolean } = {},
) {
  const initialReservation = reservation(mode);

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl);

      if (url.pathname === '/ready') {
        return Promise.resolve(jsonResponse({ service: 'nook-api', status: 'ready' }));
      }
      if (url.pathname === '/v1/agents/guest/search') {
        return Promise.resolve(
          jsonResponse({
            status: 'ready',
            interpretation: {
              status: 'ready',
              city: 'Lisbon',
              checkIn: '2026-08-20',
              checkOut: '2026-08-25',
              guests: 1,
              maximumNightlyRateAtomic: '15000',
              requiredAmenities: ['wifi'],
            },
            totalMatches: 1,
            items: [
              {
                listing,
                summary: 'The best valid work-friendly match.',
                matchReasons: ['Includes wifi', 'Within the nightly limit'],
              },
            ],
            agent: {
              interpretation: {
                provider: 'openai',
                mode: 'live',
                model: 'test-model',
              },
              ranking: {
                provider: 'openai',
                mode: 'live',
                model: 'test-model',
              },
            },
          }),
        );
      }
      if (url.pathname === '/v1/listings/drafts') {
        return Promise.resolve(
          jsonResponse({
            draft: {
              title: 'Agent-drafted Graça home',
              description: 'A calm public description based only on confirmed Host facts.',
              suggestedAmenities: ['workspace'],
              inferredFields: ['title', 'description', 'suggestedAmenities'],
            },
            agent: {
              provider: 'openai',
              mode: 'live',
              model: 'test-model',
            },
            requiresHostConfirmation: true,
          }),
        );
      }
      if (url.pathname === '/v1/listings' && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(jsonResponse({ items: [listing] }));
      }
      if (url.pathname === '/v1/listings' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            listing: {
              ...listing,
              title: 'Agent-drafted Graça home',
              status: 'draft',
            },
            availability: [],
            approvalPolicy: {
              listingId: listing.id,
              policy: {
                automaticApprovalEnabled: true,
                minimumRentalReputationTier: 'silver',
              },
              version: 1,
              updatedAt: listing.updatedAt,
            },
          }),
        );
      }
      if (url.pathname.endsWith('/publish')) {
        return Promise.resolve(
          jsonResponse({
            listing: {
              ...listing,
              title: 'Agent-drafted Graça home',
              status: 'published',
            },
            availability: [],
            approvalPolicy: {
              listingId: listing.id,
              policy: {
                automaticApprovalEnabled: true,
                minimumRentalReputationTier: 'silver',
              },
              version: 1,
              updatedAt: listing.updatedAt,
            },
          }),
        );
      }
      if (url.pathname === '/v1/booking-quotes') {
        return Promise.resolve(
          jsonResponse({
            ...quote,
            guestProfileId: initialReservation.booking.guestProfileId,
            reputationTier: mode === 'manual' ? 'newcomer' : 'silver',
          }),
        );
      }
      if (url.pathname === '/v1/reservation-holds') {
        if (options.requireWorldAgent) {
          return Promise.resolve(
            jsonResponse(
              {
                error: 'human_backed_authorization_required',
                extensions: { agentkit: { challenge: true } },
              },
              402,
            ),
          );
        }

        return Promise.resolve(jsonResponse(initialReservation));
      }
      if (url.pathname.endsWith('/deposit')) {
        return Promise.resolve(jsonResponse(confirmedDeposit(initialReservation)));
      }
      if (url.pathname.endsWith('/decision')) {
        return Promise.resolve(
          jsonResponse({
            bookingRequest: {
              ...initialReservation.bookingRequest,
              approvalResult: 'approved',
              status: 'approved',
            },
            booking: {
              ...initialReservation.booking,
              status: 'awaiting_deposit',
            },
            hold: initialReservation.hold,
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'test_route_missing',
              message: `No test response for ${url.pathname}`,
              requestId: 'test-request',
            },
          },
          404,
        ),
      );
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Nook marketplace demo', () => {
  it('shows API readiness and switches between the Guest and Host desks', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText('Marketplace ready')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Host desk' }));
    expect(screen.getByRole('heading', { name: 'Welcome back, Maria.' })).toBeTruthy();
    expect(screen.getByText('Review queue is clear')).toBeTruthy();
  });

  it('completes automatic approval and Testnet deposit confirmation', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Show available homes' }));
    expect(await screen.findByText(listing.title)).toBeTruthy();
    expect(screen.getByText('The best valid work-friendly match.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'View quote' }));
    expect(await screen.findByRole('heading', { name: 'Review the exact terms' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Reserve these dates' }));
    expect(await screen.findByRole('heading', { name: 'Approved—deposit is next' })).toBeTruthy();
    expect(screen.getByText('Verified this hold')).toBeTruthy();
    expect(screen.getByText('Live this hold')).toBeTruthy();
    expect(screen.getByText(/Agent0 on base-sepolia/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Fund Testnet deposit' }));
    expect(
      await screen.findByRole('heading', { name: 'Booking confirmed on Hedera' }),
    ).toBeTruthy();
    expect(screen.getByText('Real Testnet evidence')).toBeTruthy();
    expect(screen.getByRole('link', { name: /HTS transfer/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /HCS #14/ })).toBeTruthy();
  });

  it('hands a Newcomer request to the Host for an explicit decision', async () => {
    installMarketplaceApi('manual');
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /Jo/ }));
    await user.click(screen.getByRole('button', { name: 'Show available homes' }));
    await user.click(await screen.findByRole('button', { name: 'View quote' }));
    await user.click(await screen.findByRole('button', { name: 'Reserve these dates' }));

    expect(await screen.findByRole('heading', { name: 'Waiting for Maria' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open Host review' }));
    expect(screen.getByRole('heading', { name: 'Jo wants to stay' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Approve request' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Request approved' })).toBeTruthy();
    });
  });

  it('explains when the protected hold needs a World-verified Guest Agent', async () => {
    installMarketplaceApi('automatic', { requireWorldAgent: true });
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Show available homes' }));
    await user.click(await screen.findByRole('button', { name: 'View quote' }));
    await user.click(await screen.findByRole('button', { name: 'Reserve these dates' }));

    expect(
      await screen.findByText(
        'A World-verified Guest Agent must authorize this hold. Use the Guest Agent flow, then try again.',
      ),
    ).toBeTruthy();
  });

  it('keeps the Host in control of Agent drafting and publication', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Host desk' }));
    await user.click(screen.getByRole('button', { name: 'Ask Host Agent to draft' }));

    expect(await screen.findByRole('heading', { name: 'Review the Agent proposal' })).toBeTruthy();
    expect(screen.getByText('workspace')).toBeTruthy();
    expect(screen.getByText(/Live OpenAI/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Accept copy and save draft' }));
    expect(await screen.findByText('Agent-drafted Graça home')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    expect(await screen.findByText('Published')).toBeTruthy();
  });
});
