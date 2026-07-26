// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import type {
  BookingQuote,
  DepositResult,
  Listing,
  ListingDetail,
  ReservationResult,
} from './api.js';
import { ReownProvider } from './reown.js';

vi.mock('@worldcoin/idkit', () => ({
  proofOfHuman: () => ({ type: 'proof_of_human' }),
  IDKitRequestWidget: ({
    handleVerify,
    onSuccess,
    open,
  }: {
    handleVerify?: (result: unknown) => Promise<void> | void;
    onSuccess: (result: unknown) => Promise<void> | void;
    open: boolean;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          void (async () => {
            const proof = {
              protocol_version: '4.0',
              nonce: 'world-id-test-nonce',
              action: 'nook-member-onboarding',
              environment: 'staging',
              responses: [],
            };
            await handleVerify?.(proof);
            await onSuccess(proof);
          })();
        }}
      >
        Complete World ID verification
      </button>
    ) : null,
}));

const listing: Listing = {
  id: '30000000-0000-4000-8000-000000000001',
  hostProfileId: '10000000-0000-4000-8000-000000000002',
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
  guestProfileId: '10000000-0000-4000-8000-000000000001',
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

function paymentMandate(initialReservation: ReservationResult, status: 'active' | 'consumed') {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    bookingId: initialReservation.booking.id,
    tokenId: initialReservation.booking.settlementTokenId,
    maximumDepositAtomic: '75000',
    status,
    expiresAt: initialReservation.hold.expiresAt,
    ...(status === 'consumed'
      ? {
          operationId: '80000000-0000-4000-8000-000000000001',
          consumedAt: '2026-07-25T10:00:00.000Z',
        }
      : {}),
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderApp() {
  return render(
    <ReownProvider>
      <App />
    </ReownProvider>,
  );
}

function installMarketplaceApi(
  mode: 'automatic' | 'manual',
  options: { requireWorldAgent?: boolean } = {},
) {
  const initialReservation = reservation(mode);
  const verifiedMemberProfiles = new Set<string>();
  let createdListingDetail: ListingDetail | null = null;
  vi.stubGlobal('scrollTo', vi.fn());

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl);

      if (url.pathname === '/ready') {
        return Promise.resolve(jsonResponse({ service: 'nook-api', status: 'ready' }));
      }
      if (url.pathname === '/v1/world-id/member/config') {
        return Promise.resolve(
          jsonResponse({
            appId: 'app_nook_test',
            rpId: 'rp_nook_test',
            action: 'nook-member-onboarding',
            environment: 'staging',
          }),
        );
      }
      if (url.pathname === '/v1/world-id/member/status') {
        const profileId = url.searchParams.get('profileId');
        return Promise.resolve(
          jsonResponse(
            profileId && verifiedMemberProfiles.has(profileId)
              ? {
                  provider: 'world_id',
                  credential: 'proof_of_human',
                  humanVerified: true,
                  environment: 'staging',
                  status: 'existing',
                }
              : {
                  humanVerified: false,
                },
          ),
        );
      }
      if (url.pathname === '/v1/world-id/member/rp-signature') {
        return Promise.resolve(
          jsonResponse({
            rp_id: 'rp_nook_test',
            nonce: 'world-id-request-nonce',
            created_at: 1_784_990_000,
            expires_at: 1_784_990_300,
            signature: `0x${'a'.repeat(130)}`,
          }),
        );
      }
      if (url.pathname === '/v1/world-id/member/verify') {
        if (typeof init?.body !== 'string') {
          throw new Error('Expected JSON request body for Member verification');
        }
        const body = JSON.parse(init.body) as { profileId: string };
        verifiedMemberProfiles.add(body.profileId);
        return Promise.resolve(
          jsonResponse({
            provider: 'world_id',
            credential: 'proof_of_human',
            humanVerified: true,
            environment: 'staging',
            status: 'created',
          }),
        );
      }
      if (url.pathname === '/v1/agents/guest/world-connection') {
        if (options.requireWorldAgent) {
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'agent_not_human_backed',
                  message: 'AgentBook has no verified human for this Agent',
                  requestId: 'test-request',
                },
              },
              403,
            ),
          );
        }

        return Promise.resolve(
          jsonResponse({
            provider: 'world_agentkit',
            humanBacked: true,
            network: 'world_chain',
            onchainSignal: {
              provider: 'the_graph',
              subgraph: 'agent0',
              network: 'base-sepolia',
              chainId: 84_532,
              subgraphId: 'test-subgraph',
              sourceRef: 'the-graph:agent0:base-sepolia:test-subgraph',
              registered: true,
              active: true,
              binding: 'agent_wallet',
              requiredCapability: 'nook.rent:reservation-hold',
              capabilityPresent: true,
            },
          }),
        );
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
        if (typeof init.body !== 'string') {
          throw new Error('Expected JSON request body for Listing creation');
        }

        const body = JSON.parse(init.body) as {
          approvalPolicy: ListingDetail['approvalPolicy']['policy'];
          availability: Array<{ checkIn: string; checkOut: string }>;
          baseDepositAtomic: string;
          nightlyRateAtomic: string;
        };
        createdListingDetail = {
          listing: {
            ...listing,
            title: 'Agent-drafted Graça home',
            baseDepositAtomic: body.baseDepositAtomic,
            nightlyRateAtomic: body.nightlyRateAtomic,
            status: 'draft',
          },
          availability: body.availability.map((window, index) => ({
            id: `31000000-0000-4000-8000-00000000000${index + 1}`,
            ...window,
            nights:
              (Date.parse(`${window.checkOut}T00:00:00.000Z`) -
                Date.parse(`${window.checkIn}T00:00:00.000Z`)) /
              86_400_000,
            createdAt: listing.createdAt,
          })),
          approvalPolicy: {
            listingId: listing.id,
            policy: body.approvalPolicy,
            version: 1,
            updatedAt: listing.updatedAt,
          },
        };

        return Promise.resolve(jsonResponse(createdListingDetail, 201));
      }
      if (url.pathname.endsWith('/publish')) {
        const detail = createdListingDetail ?? {
          listing: {
            ...listing,
            title: 'Agent-drafted Graça home',
            status: 'draft' as const,
          },
          availability: [],
          approvalPolicy: {
            listingId: listing.id,
            policy: {
              automaticApprovalEnabled: true,
              minimumRentalReputationTier: 'silver' as const,
            },
            version: 1,
            updatedAt: listing.updatedAt,
          },
        };
        createdListingDetail = {
          ...detail,
          listing: {
            ...detail.listing,
            status: 'published',
          },
        };

        return Promise.resolve(jsonResponse(createdListingDetail));
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
      if (url.pathname === '/v1/agents/guest/secure-match') {
        if (typeof init?.body !== 'string') {
          throw new Error('Expected JSON request body for secure match');
        }
        const body = JSON.parse(init.body) as {
          paymentMandate: {
            authorized: boolean;
            maximumDepositAtomic: string;
          };
        };
        if (
          !body.paymentMandate.authorized ||
          body.paymentMandate.maximumDepositAtomic !== '75000'
        ) {
          throw new Error('Expected the bounded Agent Payment Mandate');
        }

        const fundedDeposit =
          mode === 'automatic' ? confirmedDeposit(initialReservation) : undefined;
        const securedReservation = fundedDeposit
          ? {
              ...initialReservation,
              booking: fundedDeposit.booking,
              hold: fundedDeposit.hold,
            }
          : initialReservation;

        return Promise.resolve(
          jsonResponse(
            {
              status: 'secured',
              mandate: {
                status: 'ready',
                city: 'Lisbon',
                checkIn: '2026-08-20',
                checkOut: '2026-08-25',
                guests: 1,
                maximumNightlyRateAtomic: '15000',
                requiredAmenities: ['wifi'],
              },
              selectedMatch: {
                listing,
                summary: 'The best valid work-friendly match.',
                matchReasons: ['Includes wifi', 'Within the nightly limit'],
              },
              quote: {
                ...quote,
                guestProfileId: initialReservation.booking.guestProfileId,
                reputationTier: mode === 'manual' ? 'newcomer' : 'silver',
              },
              reservation: securedReservation,
              paymentMandate: paymentMandate(
                initialReservation,
                mode === 'automatic' ? 'consumed' : 'active',
              ),
              ...(fundedDeposit ? { deposit: fundedDeposit } : {}),
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
            },
            201,
          ),
        );
      }
      if (url.pathname === '/v1/agents/guest/reservation-holds') {
        return Promise.resolve(jsonResponse(initialReservation));
      }
      if (url.pathname.endsWith('/deposit')) {
        return Promise.resolve(jsonResponse(confirmedDeposit(initialReservation)));
      }
      if (url.pathname.endsWith('/decision')) {
        const fundedDeposit = confirmedDeposit(initialReservation);
        return Promise.resolve(
          jsonResponse({
            bookingRequest: {
              ...initialReservation.bookingRequest,
              approvalResult: 'approved',
              status: 'approved',
            },
            booking: fundedDeposit.booking,
            hold: fundedDeposit.hold,
            paymentMandate: paymentMandate(initialReservation, 'consumed'),
            deposit: fundedDeposit,
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
  async function completeMemberWorldId(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Verify with World ID' }));
    await user.click(await screen.findByRole('button', { name: 'Complete World ID verification' }));
    expect((await screen.findAllByText('World ID verified')).length).toBeGreaterThan(0);
  }

  async function enterGuestSearch(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I’m looking for a place/ }));
    await completeMemberWorldId(user);
    await user.click(screen.getByRole('button', { name: 'Connect World-backed Agent' }));
    expect(await screen.findByText('World Agent verified')).toBeTruthy();
    expect(screen.getByText('The Graph verified')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Where to?' })).toBeTruthy();
  }

  async function enterHostCreate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I want to rent out my place/ }));
    await completeMemberWorldId(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Show us your nook.' })).toBeTruthy();
  }

  it('shows API readiness and the guided role selection', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();

    expect(await screen.findByText('Live marketplace connected')).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: 'Leave yours in good hands. Find one that feels like home.',
      }),
    ).toBeTruthy();
    expect(screen.getByText('P2P sublet marketplace for digital nomads')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByRole('heading', { name: 'A familiar welcome.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /I want to rent out my place/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /I’m looking for a place/ })).toBeTruthy();
  });

  it('skips verified Member onboarding when changing from Host to Guest', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I want to rent out my place/ }));
    await completeMemberWorldId(user);

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I’m looking for a place/ }));

    expect(await screen.findByRole('heading', { name: 'Where to?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verify with World ID' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect World-backed Agent' })).toBeNull();
  });

  it('skips verified Member onboarding when returning as a Host', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I want to rent out my place/ }));
    await completeMemberWorldId(user);

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I want to rent out my place/ }));

    expect(await screen.findByRole('heading', { name: 'Show us your nook.' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verify with World ID' })).toBeNull();
  });

  it('completes automatic approval and Testnet deposit confirmation', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();
    await enterGuestSearch(user);

    await user.click(screen.getByRole('button', { name: 'Find available nooks' }));
    expect(await screen.findByText(listing.title)).toBeTruthy();
    expect(screen.getByText('The best valid work-friendly match.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Secure and fund best match' }));
    expect(await screen.findByRole('heading', { name: 'You found your nook.' })).toBeTruthy();
    expect(screen.getByText('HCS sequence #14')).toBeTruthy();
    expect(screen.getByRole('link', { name: /HTS transaction/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /HCS record/ })).toBeTruthy();
  });

  it('waits for Host review, then autonomously funds the approved Newcomer request', async () => {
    installMarketplaceApi('manual');
    const user = userEvent.setup();

    renderApp();
    await enterGuestSearch(user);

    await user.click(screen.getByRole('button', { name: /Jo/ }));
    await completeMemberWorldId(user);
    await user.click(screen.getByRole('button', { name: 'Connect World-backed Agent' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Find available nooks' }));
    await user.click(await screen.findByRole('button', { name: 'Secure and fund best match' }));

    expect(
      await screen.findByRole('heading', { name: 'Your Host will review this.' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open Host review' }));
    expect(screen.getByRole('heading', { name: 'Jo would like to stay.' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Approve request' }));
    expect(await screen.findByRole('heading', { name: 'You found your nook.' })).toBeTruthy();
    expect(screen.getByText('HCS sequence #14')).toBeTruthy();
  });

  it('explains when the protected hold needs a World-verified Guest Agent', async () => {
    installMarketplaceApi('automatic', { requireWorldAgent: true });
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I’m looking for a place/ }));
    await completeMemberWorldId(user);
    await user.click(screen.getByRole('button', { name: 'Connect World-backed Agent' }));

    expect(
      await screen.findByText('World could not confirm that this Agent acts for a verified human.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('requires direct World ID before a Guest can connect the Agent', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I’m looking for a place/ }));

    expect(screen.getByRole('button', { name: 'Verify with World ID' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect World-backed Agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

    await completeMemberWorldId(user);

    expect(screen.getByRole('button', { name: 'Connect World-backed Agent' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('requires a real World ID result before the Host can continue', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: /I want to rent out my place/ }));

    expect(screen.getByRole('button', { name: 'Verify with World ID' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

    await completeMemberWorldId(user);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('keeps the Host in control of Agent drafting and publication', async () => {
    installMarketplaceApi('automatic');
    const user = userEvent.setup();

    renderApp();
    await enterHostCreate(user);

    await user.click(screen.getByRole('button', { name: 'Ask Host Agent to draft' }));

    expect(
      await screen.findByRole('heading', { name: 'Your Agent put this together.' }),
    ).toBeTruthy();
    expect(screen.getByText('workspace')).toBeTruthy();
    expect(screen.getByText(/Live OpenAI/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Review dates and terms' }));
    const availableFrom = screen.getByLabelText('Available from');
    const availableUntil = screen.getByLabelText('Available until');
    await user.clear(availableFrom);
    await user.type(availableFrom, '2026-09-06');
    await user.clear(availableUntil);
    await user.type(availableUntil, '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Save Listing draft' }));
    expect(await screen.findByText('Reviewable Listing draft saved.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    expect(await screen.findByRole('heading', { name: 'Your place is listed.' })).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.getByText(/Sep 6 – Sep 12/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Continue as a Guest' }));
    expect(await screen.findByRole('heading', { name: 'Where to?' })).toBeTruthy();
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Ask your Guest Agent' }).value,
    ).toContain('2026-09-06 to 2026-09-12');
  });
});
