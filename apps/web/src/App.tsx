import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  ExternalLink,
  Globe2,
  House,
  ImagePlus,
  Info,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitErrorCodes,
  type IDKitResult,
} from '@worldcoin/idkit';

import {
  type AgentExecution,
  type AgentSecureMatchResult,
  type BookingQuote,
  type DepositResult,
  type GuestAgentSearchResult,
  type HostAgentDraftResult,
  type Listing,
  type ListingDetail,
  NookApiError,
  nookApi,
  type ReservationResult,
  type SearchInput,
  type WalletEvidence,
  type WorldConnection,
  type WorldIdMemberConfig,
  type WorldIdMemberVerification,
  type WorldIdRpContext,
} from './api.js';
import { DEFAULT_GUEST_QUERY, DEFAULT_SEARCH, DEMO_PROFILES, type DemoGuestKey } from './demo.js';
import { WalletEvidencePanel } from './WalletEvidencePanel.js';

type DemoRole = 'guest' | 'host';
type ApiStatus = 'checking' | 'ready' | 'unavailable';
type Screen =
  | 'splash'
  | 'role'
  | 'identity'
  | 'host-create'
  | 'host-review'
  | 'host-terms'
  | 'listed'
  | 'guest-search'
  | 'results'
  | 'detail'
  | 'booking'
  | 'host-decision'
  | 'confirmed'
  | 'check-in';
type BusyAction =
  | 'connect-world'
  | 'connect-world-id'
  | 'create-listing'
  | 'decide'
  | 'deposit'
  | 'prepare-listing-draft'
  | 'publish-listing'
  | 'quote'
  | 'reconcile'
  | 'reserve'
  | 'search'
  | null;

const initialListingDraft = {
  propertyType: 'one-bedroom home',
  highlights: 'sunny balcony, dedicated work corner, calm courtyard',
  title: 'Sunlit Graça nook with a work corner',
  description:
    'A calm one-bedroom home for a short Lisbon stay, with a sunny balcony, fast Wi-Fi, and a dedicated work corner.',
  city: 'Lisbon',
  neighborhood: 'Graça',
  approximateLocationRef: 'lisbon-graca-demo-area',
  amenities: 'wifi, workspace, kitchen, washer, balcony',
  houseRules: 'No smoking, Quiet after 22:00',
  nightlyRateAtomic: '11000',
  baseDepositAtomic: '50000',
  maxGuests: 2,
  checkIn: '2026-09-05',
  checkOut: '2026-09-15',
};

const LISTING_IMAGES = [
  '/images/nook-arroios.jpg',
  '/images/nook-alfama.jpg',
  '/images/nook-graca.jpg',
] as const;

function imageForListing(listing: Listing | null, index = 0): string {
  if (!listing) return LISTING_IMAGES[0];

  if (/alfama/i.test(listing.neighborhood)) return LISTING_IMAGES[1];
  if (/graça|graca/i.test(listing.neighborhood)) return LISTING_IMAGES[2];
  if (/arroios/i.test(listing.neighborhood)) return LISTING_IMAGES[0];

  return LISTING_IMAGES[(index + 1) % LISTING_IMAGES.length] ?? LISTING_IMAGES[0];
}

function formatAtomicUnits(value: string): string {
  try {
    return BigInt(value).toLocaleString('en-US');
  } catch {
    return value;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function agentExecutionLabel(execution: AgentExecution): string {
  if (execution.mode === 'live') {
    return `Live ${execution.provider === 'openai' ? 'OpenAI' : execution.provider}${execution.model ? ` · ${execution.model}` : ''}`;
  }

  return `Deterministic fallback${execution.fallbackReason ? ` · ${execution.fallbackReason.replaceAll('_', ' ')}` : ''}`;
}

function friendlyError(error: NookApiError): string {
  switch (error.code) {
    case 'dates_unavailable':
      return 'Those dates were just reserved. Choose another stay or listing.';
    case 'resource_not_found':
      return 'The demo data is not ready. Initialize the Nook.rent seed data, then try again.';
    case 'domain_validation_error':
    case 'validation_error':
      return 'Check the dates and details, then try again.';
    case 'booking_request_already_decided':
      return 'This request has already been decided.';
    case 'hedera_unavailable':
      return 'Hedera Testnet is not configured in the API environment.';
    case 'human_backed_authorization_required':
      return 'This hold needs a verified World-backed Guest Agent.';
    case 'agent_not_human_backed':
      return 'World could not confirm that this Agent acts for a verified human.';
    case 'invalid_agentkit_proof':
      return 'The World AgentKit authorization is invalid or expired.';
    case 'world_nonce_replayed':
      return 'This World authorization was already used. Sign a fresh request.';
    case 'human_active_hold_limit':
      return 'This verified human already has an active hold.';
    case 'world_unavailable':
      return 'World AgentKit is not configured on the API yet.';
    case 'world_id_unavailable':
      return 'World ID is not configured on the API yet.';
    case 'world_id_verification_required':
      return 'Complete World ID verification for this Member before continuing.';
    case 'invalid_world_id_proof':
      return 'World ID could not verify this proof. Please try again.';
    case 'world_id_provider_unavailable':
      return 'World ID verification is temporarily unavailable. Please try again.';
    case 'world_id_already_bound':
      return 'This World ID is already connected to another Member profile.';
    case 'agent_not_registered':
      return 'This human-backed Agent is not registered in Agent0 yet.';
    case 'agent_registration_inactive':
      return 'This Agent0 registration is inactive.';
    case 'agent_capability_missing':
      return 'This Agent0 registration does not advertise the Nook.rent reservation capability.';
    case 'provider_timeout':
    case 'provider_unavailable':
    case 'invalid_provider_response':
      return 'The live Agent0 query through The Graph is unavailable. No dates were held.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
}

function nextAfterOnboarding(role: DemoRole): Screen {
  return role === 'host' ? 'host-create' : 'guest-search';
}

export function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [role, setRole] = useState<DemoRole>('guest');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<NookApiError | null>(null);
  const [guestKey, setGuestKey] = useState<DemoGuestKey>('experiencedGuest');
  const [guestQuery, setGuestQuery] = useState(DEFAULT_GUEST_QUERY);
  const [guestAgentSearch, setGuestAgentSearch] = useState<GuestAgentSearchResult | null>(null);
  const [search, setSearch] = useState<SearchInput>({ ...DEFAULT_SEARCH });
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [reservation, setReservation] = useState<ReservationResult | null>(null);
  const [deposit, setDeposit] = useState<DepositResult | null>(null);
  const [listingDraft, setListingDraft] = useState(initialListingDraft);
  const [hostAgentDraft, setHostAgentDraft] = useState<HostAgentDraftResult | null>(null);
  const [createdListing, setCreatedListing] = useState<ListingDetail | null>(null);
  const [worldConnection, setWorldConnection] = useState<WorldConnection | null>(null);
  const [memberWorldIdConfig, setMemberWorldIdConfig] = useState<WorldIdMemberConfig | null>(null);
  const [memberWorldIdRpContext, setMemberWorldIdRpContext] = useState<WorldIdRpContext | null>(
    null,
  );
  const [memberWorldIdOpen, setMemberWorldIdOpen] = useState(false);
  const [memberWorldIdVerification, setMemberWorldIdVerification] =
    useState<WorldIdMemberVerification | null>(null);
  const [walletEvidence, setWalletEvidence] = useState<WalletEvidence | null>(null);

  const selectedGuest = DEMO_PROFILES[guestKey];

  const checkApi = async () => {
    setApiStatus('checking');
    try {
      await nookApi.readiness();
      setApiStatus('ready');
    } catch {
      setApiStatus('unavailable');
    }
  };

  useEffect(() => {
    void checkApi();
  }, []);

  const navigate = (next: Screen) => {
    setError(null);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDemo = () => {
    setScreen('splash');
    setRole('guest');
    setGuestKey('experiencedGuest');
    setGuestQuery(DEFAULT_GUEST_QUERY);
    setGuestAgentSearch(null);
    setSearch({ ...DEFAULT_SEARCH });
    setListings([]);
    setSelectedListing(null);
    setQuote(null);
    setReservation(null);
    setDeposit(null);
    setListingDraft(initialListingDraft);
    setHostAgentDraft(null);
    setCreatedListing(null);
    setWorldConnection(null);
    setMemberWorldIdConfig(null);
    setMemberWorldIdRpContext(null);
    setMemberWorldIdOpen(false);
    setMemberWorldIdVerification(null);
    setWalletEvidence(null);
    setError(null);
  };

  const runAction = async <T,>(action: Exclude<BusyAction, null>, task: () => Promise<T>) => {
    setBusyAction(action);
    setError(null);

    try {
      return await task();
    } catch (caught) {
      const apiError =
        caught instanceof NookApiError
          ? caught
          : new NookApiError('unexpected_error', 'Unexpected application error');
      setError(apiError);
      return undefined;
    } finally {
      setBusyAction(null);
    }
  };

  const selectRole = (nextRole: DemoRole) => {
    setRole(nextRole);
    setWorldConnection(null);
    setMemberWorldIdConfig(null);
    setMemberWorldIdRpContext(null);
    setMemberWorldIdOpen(false);
    setMemberWorldIdVerification(null);
    setWalletEvidence(null);
    navigate('identity');
  };

  const connectWorldAgent = async () => {
    const result = await runAction('connect-world', () =>
      nookApi.connectWorldAgent(selectedGuest.id),
    );
    if (result) setWorldConnection(result);
  };

  const openMemberWorldId = async () => {
    setBusyAction('connect-world-id');
    setError(null);

    try {
      const [config, rpContext] = await Promise.all([
        nookApi.memberWorldIdConfig(),
        nookApi.createMemberWorldIdRpContext(),
      ]);
      setMemberWorldIdConfig(config);
      setMemberWorldIdRpContext(rpContext);
      setMemberWorldIdOpen(true);
    } catch (caught) {
      setError(
        caught instanceof NookApiError
          ? caught
          : new NookApiError('unexpected_error', 'Unexpected application error'),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const verifyMemberWorldId = async (proof: IDKitResult) => {
    setBusyAction('connect-world-id');
    setError(null);

    try {
      const verification = await nookApi.verifyMemberWorldId({
        profileId: role === 'host' ? DEMO_PROFILES.host.id : selectedGuest.id,
        proof,
      });
      setMemberWorldIdVerification(verification);
    } catch (caught) {
      const apiError =
        caught instanceof NookApiError
          ? caught
          : new NookApiError('unexpected_error', 'Unexpected application error');
      setError(apiError);
      throw caught;
    } finally {
      setBusyAction(null);
    }
  };

  const handleWorldIdWidgetError = (code: IDKitErrorCodes) => {
    setError(
      new NookApiError('world_id_widget_error', `World ID stopped with ${code}. Try again.`),
    );
  };

  const changeGuest = (nextGuestKey: DemoGuestKey) => {
    if (nextGuestKey === guestKey) return;

    setGuestKey(nextGuestKey);
    setWorldConnection(null);
    setMemberWorldIdConfig(null);
    setMemberWorldIdRpContext(null);
    setMemberWorldIdOpen(false);
    setMemberWorldIdVerification(null);
    setWalletEvidence(null);
    setSelectedListing(null);
    setQuote(null);
    setReservation(null);
    setDeposit(null);
    setError(null);
    navigate('identity');
  };

  const searchListings = async (event: FormEvent) => {
    event.preventDefault();
    setSelectedListing(null);
    setQuote(null);
    setReservation(null);
    setDeposit(null);

    const result = await runAction('search', () => nookApi.searchWithGuestAgent(guestQuery));
    if (!result) return;

    setGuestAgentSearch(result);
    if (result.status === 'needs_clarification') return;

    setSearch({
      city: result.interpretation.city,
      checkIn: result.interpretation.checkIn,
      checkOut: result.interpretation.checkOut,
      guests: result.interpretation.guests,
      ...(result.interpretation.maximumNightlyRateAtomic
        ? {
            maximumNightlyRateAtomic: result.interpretation.maximumNightlyRateAtomic,
          }
        : {}),
      amenities: result.interpretation.requiredAmenities.join(', '),
    });
    setListings(result.items.map((item) => item.listing));
    navigate('results');
  };

  const openListing = async (listing: Listing) => {
    setSelectedListing(listing);
    setReservation(null);
    setDeposit(null);
    const result = await runAction('quote', () =>
      nookApi.createQuote({
        listingId: listing.id,
        guestProfileId: selectedGuest.id,
        checkIn: search.checkIn,
        checkOut: search.checkOut,
      }),
    );
    if (result) {
      setQuote(result);
      navigate('detail');
    }
  };

  const secureBestMatch = async () => {
    const result: AgentSecureMatchResult | undefined = await runAction('reserve', () =>
      nookApi.secureBestMatch({
        guestProfileId: selectedGuest.id,
        query: guestQuery,
        idempotencyKey: `nook-agent-${selectedGuest.id}-${search.checkIn}-${search.checkOut}`,
      }),
    );

    if (!result) return;

    if (result.status === 'needs_clarification') {
      setError(new NookApiError('agent_needs_clarification', result.question));
      return;
    }

    if (result.status === 'no_match') {
      setError(new NookApiError('agent_no_match', 'No available home fits this mandate.'));
      return;
    }

    setSelectedListing(result.selectedMatch.listing);
    setQuote(result.quote);
    setReservation(result.reservation);
    navigate('booking');
  };

  const reserveDates = async () => {
    if (!quote) return;

    const result = await runAction('reserve', () =>
      nookApi.requestReservation({
        quoteId: quote.id,
        idempotencyKey: `nook-ui-${quote.id}`,
      }),
    );
    if (result) {
      setReservation(result);
      navigate('booking');
    }
  };

  const fundDeposit = async () => {
    if (!reservation) return;

    const result = await runAction('deposit', () =>
      nookApi.fundDeposit({
        bookingId: reservation.booking.id,
        idempotencyKey: `nook-deposit-${reservation.booking.id}`,
      }),
    );

    if (result) {
      setDeposit(result);
      setReservation({
        ...reservation,
        booking: result.booking,
        hold: result.hold,
      });
      navigate(result.operation.status === 'confirmed' ? 'confirmed' : 'booking');
    }
  };

  const reconcileDeposit = async () => {
    if (!deposit) return;

    const result = await runAction('reconcile', () =>
      nookApi.reconcileDeposit(deposit.operation.id),
    );

    if (result) {
      setDeposit(result);
      setReservation((current) =>
        current
          ? {
              ...current,
              booking: result.booking,
              hold: result.hold,
            }
          : current,
      );
      if (result.operation.status === 'confirmed') navigate('confirmed');
    }
  };

  const decideRequest = async (decision: 'approved' | 'rejected') => {
    if (!reservation) return;

    const result = await runAction('decide', () =>
      nookApi.decideBookingRequest({
        requestId: reservation.bookingRequest.id,
        hostProfileId: DEMO_PROFILES.host.id,
        decision,
      }),
    );

    if (result) {
      setReservation({
        ...reservation,
        bookingRequest: result.bookingRequest,
        booking: result.booking,
        hold: result.hold,
      });
    }
  };

  const prepareListingDraft = async (event: FormEvent) => {
    event.preventDefault();
    setHostAgentDraft(null);
    setCreatedListing(null);

    const result = await runAction('prepare-listing-draft', () =>
      nookApi.createHostAgentDraft({
        hostFacts: {
          city: listingDraft.city,
          neighborhood: listingDraft.neighborhood,
          propertyType: listingDraft.propertyType,
          maxGuests: listingDraft.maxGuests,
          confirmedAmenities: listingDraft.amenities
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          houseRules: listingDraft.houseRules
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          highlights: listingDraft.highlights
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        },
        imageRefs: [],
      }),
    );

    if (result) {
      setHostAgentDraft(result);
      setListingDraft((current) => ({
        ...current,
        title: result.draft.title,
        description: result.draft.description,
      }));
      navigate('host-review');
    }
  };

  const addSuggestedAmenity = (amenity: string) => {
    setListingDraft((current) => {
      const amenities = current.amenities
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (amenities.some((value) => value.toLowerCase() === amenity.toLowerCase())) {
        return current;
      }

      return { ...current, amenities: [...amenities, amenity].join(', ') };
    });
  };

  const createListing = async () => {
    const result = await runAction('create-listing', () =>
      nookApi.createListing({
        hostProfileId: DEMO_PROFILES.host.id,
        title: listingDraft.title,
        description: listingDraft.description,
        city: listingDraft.city,
        neighborhood: listingDraft.neighborhood,
        approximateLocationRef: listingDraft.approximateLocationRef,
        amenities: listingDraft.amenities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        houseRules: listingDraft.houseRules
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        settlementTokenId: '0.0.12345',
        nightlyRateAtomic: listingDraft.nightlyRateAtomic,
        baseDepositAtomic: listingDraft.baseDepositAtomic,
        maxGuests: listingDraft.maxGuests,
        availability: [
          {
            checkIn: listingDraft.checkIn,
            checkOut: listingDraft.checkOut,
          },
        ],
        approvalPolicy: {
          automaticApprovalEnabled: true,
          minimumRentalReputationTier: 'silver',
        },
      }),
    );

    if (result) setCreatedListing(result);
  };

  const publishListing = async () => {
    if (!createdListing) return;
    const result = await runAction('publish-listing', () =>
      nookApi.publishListing(createdListing.listing.id),
    );
    if (result) {
      setCreatedListing(result);
      navigate('listed');
    }
  };

  const renderScreen = () => {
    switch (screen) {
      case 'splash':
        return <SplashScreen apiStatus={apiStatus} onStart={() => navigate('role')} />;
      case 'role':
        return <RoleScreen onBack={() => navigate('splash')} onSelect={selectRole} />;
      case 'identity':
        return (
          <IdentityScreen
            busyAgent={busyAction === 'connect-world'}
            busyWorldId={busyAction === 'connect-world-id'}
            connection={worldConnection}
            error={error}
            memberVerification={memberWorldIdVerification}
            onBack={() => navigate('role')}
            onConnectAgent={() => void connectWorldAgent()}
            onContinue={() => navigate(nextAfterOnboarding(role))}
            onVerifyMember={() => void openMemberWorldId()}
            role={role}
            walletEvidence={walletEvidence}
            onClearWalletEvidence={() => setWalletEvidence(null)}
            onWalletEvidence={setWalletEvidence}
          />
        );
      case 'host-create':
        return (
          <HostCreateScreen
            busy={busyAction === 'prepare-listing-draft'}
            draft={listingDraft}
            error={error}
            onBack={() => navigate('identity')}
            onSubmit={prepareListingDraft}
            setDraft={setListingDraft}
          />
        );
      case 'host-review':
        return hostAgentDraft ? (
          <HostReviewScreen
            agentDraft={hostAgentDraft}
            draft={listingDraft}
            onAddAmenity={addSuggestedAmenity}
            onBack={() => navigate('host-create')}
            onContinue={() => navigate('host-terms')}
            setDraft={setListingDraft}
          />
        ) : null;
      case 'host-terms':
        return (
          <HostTermsScreen
            busyAction={busyAction}
            createdListing={createdListing}
            draft={listingDraft}
            error={error}
            onBack={() => navigate('host-review')}
            onCreate={createListing}
            onPublish={publishListing}
            setDraft={setListingDraft}
          />
        );
      case 'listed':
        return (
          <ListedScreen
            listing={createdListing}
            onGuestView={() => {
              setRole('guest');
              setWorldConnection(null);
              setMemberWorldIdConfig(null);
              setMemberWorldIdRpContext(null);
              setMemberWorldIdOpen(false);
              setMemberWorldIdVerification(null);
              setWalletEvidence(null);
              navigate('identity');
            }}
          />
        );
      case 'guest-search':
        return (
          <GuestSearchScreen
            agentSearch={guestAgentSearch}
            busy={busyAction === 'search'}
            error={error}
            guestKey={guestKey}
            guestQuery={guestQuery}
            onBack={() => navigate('identity')}
            onGuestChange={changeGuest}
            onQueryChange={setGuestQuery}
            onSubmit={searchListings}
          />
        );
      case 'results':
        return (
          <ResultsScreen
            agentSearch={guestAgentSearch}
            agentBusy={busyAction === 'reserve'}
            busy={busyAction === 'quote'}
            error={error}
            guestKey={guestKey}
            listings={listings}
            onBack={() => navigate('guest-search')}
            onOpen={openListing}
            onSecure={() => void secureBestMatch()}
            search={search}
            selectedListing={selectedListing}
          />
        );
      case 'detail':
        return selectedListing && quote ? (
          <DetailScreen
            busy={busyAction === 'reserve'}
            error={error}
            guestKey={guestKey}
            listing={selectedListing}
            onBack={() => navigate('results')}
            onReserve={reserveDates}
            quote={quote}
          />
        ) : null;
      case 'booking':
        return reservation ? (
          <BookingScreen
            busyAction={busyAction}
            deposit={deposit}
            error={error}
            guestKey={guestKey}
            onBack={() => navigate('detail')}
            onFund={fundDeposit}
            onHostReview={() => {
              setRole('host');
              navigate('host-decision');
            }}
            onReconcile={reconcileDeposit}
            reservation={reservation}
          />
        ) : null;
      case 'host-decision':
        return reservation ? (
          <HostDecisionScreen
            busy={busyAction === 'decide'}
            onBack={() => {
              setRole('guest');
              navigate('booking');
            }}
            onDecision={decideRequest}
            reservation={reservation}
          />
        ) : null;
      case 'confirmed':
        return reservation && deposit ? (
          <ConfirmedScreen
            deposit={deposit}
            listing={selectedListing}
            onCheckIn={() => navigate('check-in')}
            reservation={reservation}
          />
        ) : null;
      case 'check-in':
        return <CheckInTeaser onBack={() => navigate('confirmed')} />;
    }
  };

  const compact = ['splash', 'role', 'identity'].includes(screen);
  const wide = screen === 'results';

  return (
    <div className="nook-app">
      {screen !== 'splash' && (
        <AppHeader
          apiStatus={apiStatus}
          onReset={resetDemo}
          onRetryApi={() => void checkApi()}
          role={role}
        />
      )}

      <main className={`screen-stage ${compact ? 'compact' : ''} ${wide ? 'wide' : ''}`}>
        <div className="screen-fade" key={screen}>
          {renderScreen()}
        </div>
      </main>

      {memberWorldIdConfig && memberWorldIdRpContext && (
        <IDKitRequestWidget
          action={memberWorldIdConfig.action}
          action_description="Verify a human Member before using protected Nook marketplace actions"
          allow_legacy_proofs={false}
          app_id={memberWorldIdConfig.appId}
          environment={memberWorldIdConfig.environment}
          handleVerify={verifyMemberWorldId}
          onError={handleWorldIdWidgetError}
          onOpenChange={setMemberWorldIdOpen}
          onSuccess={() => setMemberWorldIdOpen(false)}
          open={memberWorldIdOpen}
          preset={proofOfHuman({
            signal: role === 'host' ? DEMO_PROFILES.host.id : selectedGuest.id,
          })}
          rp_context={memberWorldIdRpContext}
        />
      )}

      {screen !== 'splash' && (
        <footer className="site-footer">
          <span>Nook.rent · ETHGlobal Lisbon 2026</span>
          <span>3–90 nights · Hedera Testnet settlement</span>
        </footer>
      )}
    </div>
  );
}

function AppHeader({
  apiStatus,
  onReset,
  onRetryApi,
  role,
}: {
  apiStatus: ApiStatus;
  onReset: () => void;
  onRetryApi: () => void;
  role: DemoRole;
}) {
  return (
    <>
      <header className="app-header">
        <button className="wordmark" type="button" onClick={onReset}>
          <NookMark small />
          <span>Nook</span>
        </button>
        <div className="header-actions">
          <span className="role-label">
            {role === 'host' ? <Building2 size={14} /> : <Search size={14} />}
            {role === 'host' ? 'Host flow' : 'Guest flow'}
          </span>
          <button
            className={`api-status ${apiStatus}`}
            type="button"
            onClick={apiStatus === 'unavailable' ? onRetryApi : undefined}
          >
            {apiStatus === 'checking' ? <LoaderCircle className="spin" size={13} /> : <span />}
            {apiStatus === 'ready'
              ? 'API ready'
              : apiStatus === 'checking'
                ? 'Checking'
                : 'Retry API'}
          </button>
          <button className="reset-button" type="button" onClick={onReset}>
            <RefreshCw size={14} /> Restart
          </button>
        </div>
      </header>
      {apiStatus === 'unavailable' && (
        <div className="api-banner" role="alert">
          <AlertTriangle size={17} />
          The marketplace API is unavailable. You can preview onboarding, but live actions need the
          API.
        </div>
      )}
    </>
  );
}

function NookMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`nook-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <span />
    </span>
  );
}

function SplashScreen({ apiStatus, onStart }: { apiStatus: ApiStatus; onStart: () => void }) {
  return (
    <section className="splash-screen">
      <div className="splash-copy">
        <NookMark />
        <p className="quiet-label">P2P sublet marketplace for digital nomads</p>
        <h1 aria-label="Leave yours in good hands. Find one that feels like home.">
          <span>Leave yours in good hands.</span>
          <span>Find one that feels like home.</span>
        </h1>
        <p className="splash-lede">
          Sublet your place to a verified traveller while you’re away—or find a real home for your
          next 3–90 night stay.
        </p>
        <button className="primary-button large" type="button" onClick={onStart}>
          Get started <ArrowRight size={18} />
        </button>
        <div className={`splash-api-note ${apiStatus}`}>
          {apiStatus === 'checking' && <LoaderCircle className="spin" size={14} />}
          {apiStatus === 'ready' && <CheckCircle2 size={14} />}
          {apiStatus === 'unavailable' && <AlertTriangle size={14} />}
          {apiStatus === 'ready'
            ? 'Live marketplace connected'
            : apiStatus === 'checking'
              ? 'Connecting to Nook'
              : 'UI preview available · live actions offline'}
        </div>
      </div>
      <div className="splash-visual" aria-label="A warm Lisbon apartment">
        <img alt="A warm Lisbon apartment with a balcony and work desk" src={LISTING_IMAGES[0]} />
        <div className="splash-caption">
          <span>Arroios, Lisbon</span>
          <strong>A lived-in home for the in-between.</strong>
        </div>
      </div>
    </section>
  );
}

function RoleScreen({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect: (role: DemoRole) => void;
}) {
  return (
    <FlowPage
      eyebrow="Step 1 of 2"
      onBack={onBack}
      subtitle="How would you like to use Nook today?"
      title="A familiar welcome."
    >
      <div className="role-grid">
        <button className="choice-card" type="button" onClick={() => onSelect('host')}>
          <span className="choice-icon">
            <House size={28} />
          </span>
          <span>
            <strong>I want to rent out my place</strong>
            <small>
              I’m travelling and my apartment will be empty. I’d like to host a verified traveller.
            </small>
          </span>
          <ChevronRight size={20} />
        </button>
        <button className="choice-card" type="button" onClick={() => onSelect('guest')}>
          <span className="choice-icon">
            <Search size={28} />
          </span>
          <span>
            <strong>I’m looking for a place</strong>
            <small>I’m arriving in a new city and want a real home—not a hotel.</small>
          </span>
          <ChevronRight size={20} />
        </button>
      </div>
    </FlowPage>
  );
}

function IdentityScreen({
  busyAgent,
  busyWorldId,
  connection,
  error,
  memberVerification,
  onBack,
  onConnectAgent,
  onContinue,
  onClearWalletEvidence,
  onVerifyMember,
  onWalletEvidence,
  role,
  walletEvidence,
}: {
  busyAgent: boolean;
  busyWorldId: boolean;
  connection: WorldConnection | null;
  error: NookApiError | null;
  memberVerification: WorldIdMemberVerification | null;
  onBack: () => void;
  onConnectAgent: () => void;
  onContinue: () => void;
  onClearWalletEvidence: () => void;
  onVerifyMember: () => void;
  onWalletEvidence: (evidence: WalletEvidence) => void;
  role: DemoRole;
  walletEvidence: WalletEvidence | null;
}) {
  const isGuest = role === 'guest';
  const connectingAgent = isGuest && memberVerification && !connection;

  return (
    <FlowPage
      eyebrow="Step 2 of 2"
      onBack={onBack}
      subtitle=""
      title={connectingAgent ? 'Connect your Agent.' : 'Verify with World ID.'}
    >
      <div className="identity-card">
        {connectingAgent || connection ? (
          <div className="world-orb" aria-hidden="true">
            {Array.from({ length: 30 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : (
          <div className="world-id-mark" aria-hidden="true">
            <Globe2 size={32} />
          </div>
        )}
        <div className="identity-status-line">
          <span className={memberVerification ? 'live-badge' : 'preview-badge'}>
            {connection
              ? 'Verification complete'
              : memberVerification
                ? 'World ID verified'
                : 'World ID · Proof of Human'}
          </span>
          {connectingAgent && (
            <InfoTooltip label="How World and The Graph verification works">
              This checks that the Agent is human-backed through World and has an active Nook
              capability through The Graph. The protected hold checks both again.
            </InfoTooltip>
          )}
        </div>
        <h2>{connectingAgent ? 'Your Agent, backed by you' : 'Human, without the oversharing'}</h2>
        <p>
          {connectingAgent
            ? 'Connect the Agent that can search, select, and secure an eligible home within your mandate.'
            : 'Scan the live World ID QR code in World App. Nook stores only a private, action-specific verification—not your name, wallet, or exact address.'}
        </p>
        <div className="privacy-first">
          <ShieldCheck size={18} />
          <strong>Privacy First</strong>
        </div>
        {!memberVerification ? (
          <button
            className="primary-button full-width"
            disabled={busyWorldId}
            type="button"
            onClick={onVerifyMember}
          >
            {busyWorldId ? (
              <>
                <LoaderCircle className="spin" size={17} /> Preparing World ID
              </>
            ) : (
              <>
                Verify with World ID <ArrowRight size={17} />
              </>
            )}
          </button>
        ) : isGuest && !connection ? (
          <>
            <div className="verification-badges" role="status">
              <VerificationBadge
                detail="Private Proof of Human"
                icon={<CheckCircle2 size={16} />}
                label="World ID verified"
              />
            </div>
            <button
              className="primary-button full-width"
              disabled={busyAgent}
              type="button"
              onClick={onConnectAgent}
            >
              {busyAgent ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Checking World + The Graph
                </>
              ) : (
                <>
                  Connect World-backed Agent <ArrowRight size={17} />
                </>
              )}
            </button>
          </>
        ) : isGuest && connection ? (
          <>
            <div className="verification-badges" role="status">
              <VerificationBadge
                detail="Private Proof of Human"
                icon={<CheckCircle2 size={16} />}
                label="World ID verified"
              />
              <VerificationBadge
                detail="Human-backed Agent"
                icon={<CheckCircle2 size={16} />}
                label="World Agent verified"
              />
              <VerificationBadge
                detail={`${connection.onchainSignal.network} · capability active`}
                icon={<Network size={16} />}
                label="The Graph verified"
              />
            </div>
            <WalletEvidencePanel
              evidence={walletEvidence}
              onClear={onClearWalletEvidence}
              onEvidence={onWalletEvidence}
            />
            <button className="primary-button full-width" type="button" onClick={onContinue}>
              Continue <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <button className="primary-button full-width" type="button" onClick={onContinue}>
            Continue <ArrowRight size={17} />
          </button>
        )}
      </div>
      {error && <InlineError error={error} />}
      {role === 'host' && (
        <BoundaryNote icon={<ShieldCheck size={18} />}>
          World ID proves a unique human completed Member onboarding. The proof is verified by the
          API and kept separate from public Listing and Hedera data.
        </BoundaryNote>
      )}
    </FlowPage>
  );
}

function FlowPage({
  children,
  eyebrow,
  onBack,
  subtitle,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  onBack: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="flow-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <p className="flow-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {subtitle && <p className="flow-subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}

function InfoTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="info-tooltip">
      <button aria-describedby="guest-world-verification-help" aria-label={label} type="button">
        <Info size={15} />
      </button>
      <span className="info-tooltip-content" id="guest-world-verification-help" role="tooltip">
        {children}
      </span>
    </span>
  );
}

function BoundaryNote({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="boundary-note">
      {icon}
      <p>{children}</p>
    </div>
  );
}

function VerificationBadge({
  detail,
  icon,
  label,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="verification-badge">
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </span>
  );
}

function HostCreateScreen({
  busy,
  draft,
  error,
  onBack,
  onSubmit,
  setDraft,
}: {
  busy: boolean;
  draft: typeof initialListingDraft;
  error: NookApiError | null;
  onBack: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  setDraft: React.Dispatch<React.SetStateAction<typeof initialListingDraft>>;
}) {
  return (
    <section className="workspace-page host-create-page">
      <PageTop
        eyebrow="Host · Create a Listing"
        onBack={onBack}
        subtitle="Start with confirmed public facts. Your Host Agent drafts the copy; you review every inference."
        title="Show us your nook."
      />

      <div className="host-create-grid">
        <div className="photo-workbench">
          <div className="photo-hero">
            <img alt="Sunlit Graça apartment with a balcony" src={LISTING_IMAGES[2]} />
            <span>
              <Camera size={15} /> Demo photo set
            </span>
          </div>
          <div className="photo-strip" aria-label="Demo Listing photos">
            {LISTING_IMAGES.map((image, index) => (
              <img alt={`Demo Lisbon apartment view ${index + 1}`} key={image} src={image} />
            ))}
            <button aria-label="Add photos in a future upload flow" type="button">
              <ImagePlus size={19} />
            </button>
          </div>
          <BoundaryNote icon={<LockKeyhole size={18} />}>
            Exact address and access details stay private. The hackathon flow uses a public
            approximate area only.
          </BoundaryNote>
        </div>

        <form className="nook-form" onSubmit={(event) => void onSubmit(event)}>
          <div className="field-row">
            <Field label="City">
              <input
                required
                value={draft.city}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, city: event.target.value }))
                }
              />
            </Field>
            <Field label="Neighborhood">
              <input
                required
                value={draft.neighborhood}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, neighborhood: event.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Property type">
            <input
              required
              value={draft.propertyType}
              onChange={(event) =>
                setDraft((current) => ({ ...current, propertyType: event.target.value }))
              }
            />
          </Field>
          <Field label="Confirmed highlights · comma separated">
            <textarea
              required
              rows={3}
              value={draft.highlights}
              onChange={(event) =>
                setDraft((current) => ({ ...current, highlights: event.target.value }))
              }
            />
          </Field>
          <Field label="Confirmed amenities · comma separated">
            <input
              value={draft.amenities}
              onChange={(event) =>
                setDraft((current) => ({ ...current, amenities: event.target.value }))
              }
            />
          </Field>
          <Field label="House rules · comma separated">
            <input
              value={draft.houseRules}
              onChange={(event) =>
                setDraft((current) => ({ ...current, houseRules: event.target.value }))
              }
            />
          </Field>
          {error && <InlineError error={error} />}
          <button className="primary-button full-width" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} /> Your Host Agent is drafting…
              </>
            ) : (
              <>
                Ask Host Agent to draft <Sparkles size={17} />
              </>
            )}
          </button>
          <p className="form-footnote">
            Photos are presentation assets in this UI phase. The Agent receives only the confirmed
            public facts above.
          </p>
        </form>
      </div>
    </section>
  );
}

function HostReviewScreen({
  agentDraft,
  draft,
  onAddAmenity,
  onBack,
  onContinue,
  setDraft,
}: {
  agentDraft: HostAgentDraftResult;
  draft: typeof initialListingDraft;
  onAddAmenity: (amenity: string) => void;
  onBack: () => void;
  onContinue: () => void;
  setDraft: React.Dispatch<React.SetStateAction<typeof initialListingDraft>>;
}) {
  const amenities = draft.amenities
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <section className="workspace-page review-page">
      <PageTop
        eyebrow="Host Agent · Review"
        onBack={onBack}
        subtitle="Edit anything that doesn’t feel right. Suggested amenities remain unconfirmed until you add them."
        title="Your Agent put this together."
      />

      <div className="review-layout">
        <div className="listing-photo-card">
          <img alt="Sunlit Graça apartment with a work desk" src={LISTING_IMAGES[2]} />
          <div className="photo-dots">
            <span className="active" />
            <span />
            <span />
          </div>
        </div>

        <article className="draft-editor">
          <div className="draft-meta">
            <span className="agent-pill">
              <Sparkles size={13} /> {agentExecutionLabel(agentDraft.agent)}
            </span>
            <span className="review-required">
              <Clock3 size={13} /> Host review required
            </span>
          </div>
          <Field label="Listing title">
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={5}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>
          <div className="amenity-block">
            <span className="field-label">Confirmed amenities</span>
            <div className="chip-row">
              {amenities.map((amenity) => (
                <span className="amenity-chip" key={amenity}>
                  <Check size={12} /> {amenity}
                </span>
              ))}
            </div>
          </div>
          {agentDraft.draft.suggestedAmenities.length > 0 && (
            <div className="suggestion-block">
              <span className="field-label">Unconfirmed Agent suggestions</span>
              <div className="chip-row">
                {agentDraft.draft.suggestedAmenities.map((amenity) => (
                  <button
                    className="suggestion-chip"
                    key={amenity}
                    type="button"
                    onClick={() => onAddAmenity(amenity)}
                  >
                    + {amenity}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="primary-button full-width" type="button" onClick={onContinue}>
            Review dates and terms <ArrowRight size={17} />
          </button>
        </article>
      </div>
    </section>
  );
}

function HostTermsScreen({
  busyAction,
  createdListing,
  draft,
  error,
  onBack,
  onCreate,
  onPublish,
  setDraft,
}: {
  busyAction: BusyAction;
  createdListing: ListingDetail | null;
  draft: typeof initialListingDraft;
  error: NookApiError | null;
  onBack: () => void;
  onCreate: () => Promise<void>;
  onPublish: () => Promise<void>;
  setDraft: React.Dispatch<React.SetStateAction<typeof initialListingDraft>>;
}) {
  return (
    <section className="workspace-page terms-page">
      <PageTop
        eyebrow="Host · Terms"
        onBack={onBack}
        subtitle="Availability, price, deposit, and approval stay under your control—not the Agent’s."
        title="You set the terms."
      />
      <div className="terms-layout">
        <div className="terms-card">
          <h2>When is your place available?</h2>
          <div className="field-row">
            <Field label="Available from">
              <input
                required
                type="date"
                value={draft.checkIn}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, checkIn: event.target.value }))
                }
              />
            </Field>
            <Field label="Available until">
              <input
                required
                type="date"
                value={draft.checkOut}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, checkOut: event.target.value }))
                }
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Nightly amount · Testnet units">
              <input
                inputMode="numeric"
                value={draft.nightlyRateAtomic}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    nightlyRateAtomic: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Base refundable deposit">
              <input
                inputMode="numeric"
                value={draft.baseDepositAtomic}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    baseDepositAtomic: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <Field label="Maximum guests">
            <input
              min="1"
              type="number"
              value={draft.maxGuests}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maxGuests: Number(event.target.value),
                }))
              }
            />
          </Field>
        </div>

        <aside className="policy-card">
          <span className="policy-icon">
            <ShieldCheck size={24} />
          </span>
          <p className="flow-eyebrow">Approval policy</p>
          <h2>Automatic for Silver+</h2>
          <p>
            Experienced Guests may qualify automatically. Newcomers receive a fair Host review
            path—not a rejection.
          </p>
          <dl>
            <div>
              <dt>Published nightly amount</dt>
              <dd>{formatAtomicUnits(draft.nightlyRateAtomic)} test units</dd>
            </div>
            <div>
              <dt>Settlement network</dt>
              <dd>Hedera Testnet</dd>
            </div>
            <div>
              <dt>Stay length</dt>
              <dd>3–90 nights enforced</dd>
            </div>
          </dl>
        </aside>
      </div>

      {error && <InlineError error={error} />}

      {!createdListing ? (
        <button
          className="primary-button centered-action"
          disabled={busyAction !== null}
          type="button"
          onClick={() => void onCreate()}
        >
          {busyAction === 'create-listing' ? (
            <>
              <LoaderCircle className="spin" size={17} /> Saving reviewable draft…
            </>
          ) : (
            <>
              Save Listing draft <ArrowRight size={17} />
            </>
          )}
        </button>
      ) : (
        <div className="publish-confirmation">
          <CheckCircle2 size={22} />
          <div>
            <strong>Reviewable Listing draft saved.</strong>
            <p>Nothing is public until you confirm publication.</p>
          </div>
          <button
            className="primary-button"
            disabled={busyAction !== null}
            type="button"
            onClick={() => void onPublish()}
          >
            {busyAction === 'publish-listing' ? (
              <>
                <LoaderCircle className="spin" size={17} /> Publishing…
              </>
            ) : (
              <>
                Confirm and publish <Check size={17} />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

function ListedScreen({
  listing,
  onGuestView,
}: {
  listing: ListingDetail | null;
  onGuestView: () => void;
}) {
  return (
    <section className="success-page">
      <SuccessMark />
      <p className="flow-eyebrow">Host flow complete</p>
      <h1>Your place is listed.</h1>
      <p>Guests can now find it for the dates you made available.</p>
      <article className="listed-card">
        <img alt="Sunlit Graça apartment with a balcony" src={LISTING_IMAGES[2]} />
        <div>
          <h2>{listing?.listing.title ?? 'Your Graça nook'}</h2>
          <p>
            {formatDate(initialListingDraft.checkIn)} – {formatDate(initialListingDraft.checkOut)} ·{' '}
            {formatAtomicUnits(initialListingDraft.nightlyRateAtomic)} test units / night
          </p>
          <span className="live-badge">
            <span /> Published
          </span>
        </div>
      </article>
      <button className="primary-button" type="button" onClick={onGuestView}>
        Continue as a Guest <ArrowRight size={17} />
      </button>
    </section>
  );
}

function GuestSearchScreen({
  agentSearch,
  busy,
  error,
  guestKey,
  guestQuery,
  onBack,
  onGuestChange,
  onQueryChange,
  onSubmit,
}: {
  agentSearch: GuestAgentSearchResult | null;
  busy: boolean;
  error: NookApiError | null;
  guestKey: DemoGuestKey;
  guestQuery: string;
  onBack: () => void;
  onGuestChange: (guestKey: DemoGuestKey) => void;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  const selected = DEMO_PROFILES[guestKey];

  return (
    <section className="workspace-page search-page">
      <PageTop
        eyebrow="Guest Agent · Search"
        onBack={onBack}
        subtitle="Describe the stay naturally. The Agent interprets your request; Nook applies the real availability and price filters."
        title="Where to?"
      />

      <div className="guest-profile-switch">
        <div>
          <span className="field-label">Demo Rental Reputation profile</span>
          <p>
            Seeded UI data until the HCS projection is built. Changing persona requires its own
            Member verification.
          </p>
        </div>
        <div className="profile-options">
          {(['experiencedGuest', 'newcomerGuest'] as const).map((key) => {
            const guest = DEMO_PROFILES[key];
            return (
              <button
                className={guestKey === key ? 'selected' : ''}
                key={key}
                type="button"
                onClick={() => onGuestChange(key)}
              >
                <span className="avatar">{guest.name.slice(0, 1)}</span>
                <span>
                  <strong>{guest.name}</strong>
                  <small>{guest.reputationLabel}</small>
                </span>
                {guestKey === key && <Check size={14} />}
              </button>
            );
          })}
        </div>
        <div className={`reputation-preview ${selected.tier}`}>
          <BedDouble size={19} />
          <div>
            <strong>{selected.reputationLabel}</strong>
            <span>Demo Rental Reputation · not live sponsor evidence</span>
          </div>
        </div>
      </div>

      <form className="agent-search-card" onSubmit={(event) => void onSubmit(event)}>
        <span className="agent-orbit">
          <Sparkles size={22} />
        </span>
        <label htmlFor="guest-query">Ask your Guest Agent</label>
        <textarea
          id="guest-query"
          required
          rows={5}
          value={guestQuery}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <div className="query-hints">
          <span>City</span>
          <span>Dates</span>
          <span>Guests</span>
          <span>Budget</span>
          <span>Must-haves</span>
        </div>
        {agentSearch?.status === 'needs_clarification' && (
          <div className="clarification">
            <Sparkles size={17} />
            <p>{agentSearch.question}</p>
          </div>
        )}
        {error && <InlineError error={error} />}
        <button className="primary-button full-width" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={17} /> Your Agent is looking…
            </>
          ) : (
            <>
              Find available nooks <Search size={17} />
            </>
          )}
        </button>
      </form>
    </section>
  );
}

function ResultsScreen({
  agentBusy,
  agentSearch,
  busy,
  error,
  guestKey,
  listings,
  onBack,
  onOpen,
  onSecure,
  search,
  selectedListing,
}: {
  agentBusy: boolean;
  agentSearch: GuestAgentSearchResult | null;
  busy: boolean;
  error: NookApiError | null;
  guestKey: DemoGuestKey;
  listings: Listing[];
  onBack: () => void;
  onOpen: (listing: Listing) => Promise<void>;
  onSecure: () => void;
  search: SearchInput;
  selectedListing: Listing | null;
}) {
  const guest = DEMO_PROFILES[guestKey];

  return (
    <section className="workspace-page results-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Change search
      </button>
      <div className="results-heading">
        <div>
          <p className="flow-eyebrow">
            {search.city} · {formatDate(search.checkIn)}–{formatDate(search.checkOut)}
          </p>
          <h1>
            {listings.length > 0
              ? `Your Agent found ${listings.length} ${listings.length === 1 ? 'nook' : 'nooks'}.`
              : 'No valid nooks yet.'}
          </h1>
          <p>
            Database-filtered for dates, occupancy, budget, and must-haves—then ranked by your
            Agent.
          </p>
        </div>
        <div className="approval-path-card">
          <span className="demo-tag">Demo reputation</span>
          <strong>{guest.reputationLabel}</strong>
          <small>
            {guest.tier === 'silver'
              ? 'Eligible for automatic approval where the Host enables it'
              : 'Fair Host review path'}
          </small>
        </div>
      </div>

      {agentSearch?.status === 'ready' && (
        <div className="agent-run-strip">
          <Sparkles size={15} />
          <span>{agentExecutionLabel(agentSearch.agent.interpretation)}</span>
          {agentSearch.agent.ranking && (
            <span>Ranking: {agentExecutionLabel(agentSearch.agent.ranking)}</span>
          )}
        </div>
      )}

      {listings.length > 0 && (
        <div className="agentic-action-card">
          <div>
            <span className="demo-tag">Agentic action</span>
            <strong>Let your Agent secure the best match</strong>
            <small>It can select, quote, and hold one home within this mandate.</small>
          </div>
          <button className="primary-button" disabled={agentBusy} type="button" onClick={onSecure}>
            {agentBusy ? (
              <>
                <LoaderCircle className="spin" size={17} /> Securing dates…
              </>
            ) : (
              <>
                Secure best match <Sparkles size={17} />
              </>
            )}
          </button>
        </div>
      )}
      {error && <InlineError error={error} />}

      {listings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={26} />}
          text="Try different dates, fewer must-have amenities, or a wider budget."
          title="Nothing matches those dates"
        />
      ) : (
        <div className="marketplace-grid">
          {listings.map((listing, index) => {
            const recommendation =
              agentSearch?.status === 'ready'
                ? agentSearch.items.find((item) => item.listing.id === listing.id)
                : undefined;

            return (
              <article className="market-card" key={listing.id}>
                <div className="market-image">
                  <img
                    alt={`${listing.title} in ${listing.neighborhood}`}
                    src={imageForListing(listing, index)}
                  />
                  <span className="available-chip">
                    <Check size={12} /> Dates available
                  </span>
                </div>
                <div className="market-content">
                  <p className="listing-area">
                    <MapPin size={13} /> {listing.neighborhood}, {listing.city}
                  </p>
                  <h2>{listing.title}</h2>
                  <div className="chip-row">
                    {listing.amenities.slice(0, 4).map((amenity) => (
                      <span className="amenity-chip" key={amenity}>
                        {amenity}
                      </span>
                    ))}
                  </div>
                  {recommendation && (
                    <div className="match-note">
                      <Sparkles size={15} />
                      <div>
                        <strong>Why it matches</strong>
                        <p>{recommendation.summary}</p>
                      </div>
                    </div>
                  )}
                  <div className="market-footer">
                    <div>
                      <strong>{formatAtomicUnits(listing.nightlyRateAtomic)}</strong>
                      <span> test units / night</span>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      type="button"
                      onClick={() => void onOpen(listing)}
                    >
                      {busy && selectedListing?.id === listing.id ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <>
                          View nook <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DetailScreen({
  busy,
  error,
  guestKey,
  listing,
  onBack,
  onReserve,
  quote,
}: {
  busy: boolean;
  error: NookApiError | null;
  guestKey: DemoGuestKey;
  listing: Listing;
  onBack: () => void;
  onReserve: () => Promise<void>;
  quote: BookingQuote;
}) {
  const guest = DEMO_PROFILES[guestKey];
  const quoteExpired = Date.parse(quote.expiresAt) <= Date.now();

  return (
    <section className="workspace-page detail-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to results
      </button>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-photo">
            <img
              alt={`${listing.title} in ${listing.neighborhood}`}
              src={imageForListing(listing)}
            />
            <span>
              <MapPin size={14} /> Approximate area · {listing.neighborhood}
            </span>
          </div>
          <article className="detail-copy surface-card">
            <p className="flow-eyebrow">{listing.city} · 3–90 night stays</p>
            <h1>{listing.title}</h1>
            <p>{listing.description}</p>
            <h2>Amenities</h2>
            <div className="chip-row">
              {listing.amenities.map((amenity) => (
                <span className="amenity-chip" key={amenity}>
                  <Check size={12} /> {amenity}
                </span>
              ))}
            </div>
            <h2>House rules</h2>
            <ul className="rule-list">
              {listing.houseRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
        </div>

        <aside className="booking-sidebar">
          <div className="quote-card">
            <div className="quote-top">
              <span>Exact Booking Quote</span>
              <span className={quoteExpired ? 'expired' : ''}>
                <Clock3 size={13} /> {quoteExpired ? 'Expired' : '15 min'}
              </span>
            </div>
            <div className="price-display">
              <strong>{formatAtomicUnits(quote.nightlyRateAtomic)}</strong>
              <span>test units / night</span>
            </div>
            <dl className="quote-lines">
              <div>
                <dt>{quote.nights} nights</dt>
                <dd>{formatAtomicUnits(quote.staySubtotalAtomic)}</dd>
              </div>
              <div>
                <dt>Refundable deposit</dt>
                <dd>{formatAtomicUnits(quote.quotedDepositAtomic)}</dd>
              </div>
              <div>
                <dt>Total due</dt>
                <dd>{formatAtomicUnits(quote.totalDueAtomic)}</dd>
              </div>
            </dl>
            <div className="reputation-quote">
              <span className="demo-tag">Demo Rental Reputation</span>
              <strong>{guest.reputationLabel}</strong>
              <p>
                {quote.reputationTier === 'newcomer'
                  ? 'This quote uses the Newcomer deposit and Host review path.'
                  : 'This quote uses the stored Silver-tier policy.'}
              </p>
            </div>
            {error && <InlineError error={error} />}
            <button
              className="primary-button full-width"
              disabled={busy || quoteExpired}
              type="button"
              onClick={() => void onReserve()}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Protecting your dates…
                </>
              ) : (
                <>
                  Request this nook <ArrowRight size={17} />
                </>
              )}
            </button>
            <p className="form-footnote">
              World and Agent0 are verified before dates are held. Hedera settlement happens only
              after approval.
            </p>
          </div>

          <div className="assurance-list">
            <AssuranceRow
              icon={<ShieldCheck size={18} />}
              label="World"
              text="Human-backed authorization at hold"
            />
            <AssuranceRow
              icon={<Network size={18} />}
              label="The Graph"
              text="Live Agent0 capability check"
            />
            <AssuranceRow
              icon={<Coins size={18} />}
              label="Hedera"
              text="Testnet deposit after approval"
            />
          </div>
        </aside>
      </div>
    </section>
  );
}

function BookingScreen({
  busyAction,
  deposit,
  error,
  guestKey,
  onBack,
  onFund,
  onHostReview,
  onReconcile,
  reservation,
}: {
  busyAction: BusyAction;
  deposit: DepositResult | null;
  error: NookApiError | null;
  guestKey: DemoGuestKey;
  onBack: () => void;
  onFund: () => Promise<void>;
  onHostReview: () => void;
  onReconcile: () => Promise<void>;
  reservation: ReservationResult;
}) {
  const manual = reservation.booking.status === 'approval_pending';
  const rejected = reservation.booking.status === 'rejected';
  const guest = DEMO_PROFILES[guestKey];
  const operationPending =
    deposit &&
    ['pending', 'reserved', 'submitted', 'reconciling'].includes(deposit.operation.status);

  return (
    <section className="status-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Listing
      </button>

      <div className={`status-hero ${rejected ? 'rejected' : ''}`}>
        {rejected ? (
          <XCircle size={34} />
        ) : manual ? (
          <Clock3 size={34} />
        ) : (
          <CheckCircle2 size={34} />
        )}
        <p className="flow-eyebrow">Reservation Hold created</p>
        <h1>
          {rejected
            ? 'Request declined.'
            : manual
              ? 'Your Host will review this.'
              : 'Approved—your deposit is next.'}
        </h1>
        <p>
          {rejected
            ? 'The hold was released and the dates are available again.'
            : manual
              ? 'The dates are protected while the Host reviews this Newcomer request.'
              : 'The stored Host policy approved this request. Fund the exact Testnet deposit to confirm.'}
        </p>
      </div>

      <div className="status-layout">
        <article className="status-card">
          <h2>What just happened</h2>
          <ol className="flow-timeline">
            <StatusStep complete label="World authorization" text="Human-backed Agent confirmed" />
            <StatusStep complete label="Agent0 signal" text="Active booking capability confirmed" />
            <StatusStep complete label="Dates protected" text="Atomic Reservation Hold created" />
            <StatusStep
              active={!manual && !rejected}
              complete={rejected}
              label="Host policy"
              text={
                manual
                  ? 'Host review required'
                  : rejected
                    ? 'Request closed'
                    : 'Automatic approval passed'
              }
            />
            <StatusStep
              active={Boolean(operationPending)}
              label="Hedera deposit"
              text={deposit ? `Operation ${deposit.operation.status}` : 'Runs only after approval'}
            />
          </ol>
        </article>

        <aside className="evidence-card">
          <p className="flow-eyebrow">Evidence returned by the API</p>
          <h2>Separate, verifiable signals</h2>
          <EvidenceRow
            live={reservation.authorization?.humanBacked === true}
            label="World"
            value={
              reservation.authorization?.humanBacked ? 'Human-backed this hold' : 'No live evidence'
            }
          />
          <EvidenceRow
            live={reservation.onchainSignal?.capabilityPresent === true}
            label="The Graph"
            value={
              reservation.onchainSignal?.capabilityPresent
                ? `${reservation.onchainSignal.network} · capability active`
                : 'No live evidence'
            }
          />
          <EvidenceRow demo label="Rental Reputation" value={guest.reputationLabel} />
          <EvidenceRow
            live={deposit?.operation.status === 'confirmed'}
            label="Hedera"
            value={deposit ? `Operation ${deposit.operation.status}` : 'Awaiting deposit'}
          />
        </aside>
      </div>

      {error && <InlineError error={error} />}

      <div className="status-actions">
        {manual && (
          <button className="primary-button" type="button" onClick={onHostReview}>
            Open Host review <ArrowRight size={17} />
          </button>
        )}
        {reservation.booking.status === 'awaiting_deposit' && !deposit && (
          <button
            className="primary-button"
            disabled={busyAction !== null}
            type="button"
            onClick={() => void onFund()}
          >
            {busyAction === 'deposit' ? (
              <>
                <LoaderCircle className="spin" size={17} /> Submitting Testnet deposit…
              </>
            ) : (
              <>
                Fund Testnet deposit <Coins size={17} />
              </>
            )}
          </button>
        )}
        {operationPending && (
          <button
            className="secondary-button"
            disabled={busyAction !== null}
            type="button"
            onClick={() => void onReconcile()}
          >
            {busyAction === 'reconcile' ? (
              <>
                <LoaderCircle className="spin" size={16} /> Checking Mirror Node…
              </>
            ) : (
              <>
                Reconcile with Mirror Node <RefreshCw size={15} />
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

function HostDecisionScreen({
  busy,
  onBack,
  onDecision,
  reservation,
}: {
  busy: boolean;
  onBack: () => void;
  onDecision: (decision: 'approved' | 'rejected') => Promise<void>;
  reservation: ReservationResult;
}) {
  const decided = reservation.bookingRequest.status !== 'pending';

  return (
    <section className="workspace-page host-decision-page">
      <PageTop
        eyebrow="Host · Review queue"
        onBack={onBack}
        subtitle="Missing rental history is not negative evidence. Review the exact request and decide explicitly."
        title="Jo would like to stay."
      />
      <article className="decision-card">
        <div className="decision-person">
          <span className="avatar large">J</span>
          <div>
            <span className="demo-tag">Demo Rental Reputation</span>
            <h2>Newcomer</h2>
            <p>No verified Nook stays yet · fair Host review path</p>
          </div>
        </div>
        <dl className="decision-facts">
          <div>
            <dt>Dates</dt>
            <dd>
              {formatDate(reservation.hold.checkIn)}–{formatDate(reservation.hold.checkOut)}
            </dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>{reservation.hold.nights} nights</dd>
          </div>
          <div>
            <dt>Deposit</dt>
            <dd>{formatAtomicUnits(reservation.booking.depositAmountAtomic)} test units</dd>
          </div>
          <div>
            <dt>Date protection</dt>
            <dd>
              {reservation.hold.status === 'active' ? 'Hold active' : reservation.hold.status}
            </dd>
          </div>
        </dl>
        <BoundaryNote icon={<ShieldCheck size={18} />}>
          World and Agent0 already authorized the request. They do not substitute for rental history
          or make this Host decision.
        </BoundaryNote>

        {decided ? (
          <div className="decision-result">
            {reservation.bookingRequest.status === 'approved' ? (
              <CheckCircle2 size={24} />
            ) : (
              <XCircle size={24} />
            )}
            <div>
              <strong>
                Request {reservation.bookingRequest.status === 'approved' ? 'approved' : 'declined'}
              </strong>
              <p>The Guest timeline is updated and the action is recorded.</p>
            </div>
            <button className="secondary-button" type="button" onClick={onBack}>
              Return to Guest status
            </button>
          </div>
        ) : (
          <div className="decision-actions">
            <button
              className="danger-button"
              disabled={busy}
              type="button"
              onClick={() => void onDecision('rejected')}
            >
              Decline
            </button>
            <button
              className="primary-button"
              disabled={busy}
              type="button"
              onClick={() => void onDecision('approved')}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Saving decision…
                </>
              ) : (
                <>
                  Approve request <Check size={17} />
                </>
              )}
            </button>
          </div>
        )}
      </article>
    </section>
  );
}

function ConfirmedScreen({
  deposit,
  listing,
  onCheckIn,
  reservation,
}: {
  deposit: DepositResult;
  listing: Listing | null;
  onCheckIn: () => void;
  reservation: ReservationResult;
}) {
  return (
    <section className="success-page confirmed-page">
      <SuccessMark />
      <p className="flow-eyebrow">Booking confirmed</p>
      <h1>You found your nook.</h1>
      <p>
        {listing?.neighborhood ?? 'Lisbon'} · {formatDate(reservation.hold.checkIn)}–
        {formatDate(reservation.hold.checkOut)}
      </p>

      <article className="confirmation-card">
        <div className="confirmation-image">
          <img alt={listing?.title ?? 'Your Lisbon nook'} src={imageForListing(listing)} />
        </div>
        <div className="confirmation-details">
          <div>
            <span>Testnet deposit funded</span>
            <strong>{formatAtomicUnits(deposit.escrow.amountAtomic)} test units</strong>
            <small>Token {deposit.escrow.tokenId} · no real monetary value</small>
          </div>
          <div>
            <span>Reservation Hold</span>
            <strong>Converted into a Booking</strong>
            <small>{reservation.booking.id.slice(0, 18)}…</small>
          </div>
          <div>
            <span>Hedera evidence</span>
            <strong>
              {deposit.evidence.status === 'confirmed'
                ? `HCS sequence #${deposit.evidence.sequenceNumber}`
                : 'Evidence pending'}
            </strong>
            <div className="evidence-links">
              {deposit.operation.transactionUrl && (
                <a href={deposit.operation.transactionUrl} rel="noreferrer" target="_blank">
                  HTS transaction <ExternalLink size={13} />
                </a>
              )}
              {deposit.evidence.status === 'confirmed' && deposit.evidence.topicUrl && (
                <a href={deposit.evidence.topicUrl} rel="noreferrer" target="_blank">
                  HCS record <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      </article>

      <button className="primary-button" type="button" onClick={onCheckIn}>
        Preview check-in stage <KeyRound size={17} />
      </button>
    </section>
  );
}

function CheckInTeaser({ onBack }: { onBack: () => void }) {
  return (
    <section className="workspace-page checkin-page">
      <PageTop
        eyebrow="Future workflow"
        onBack={onBack}
        subtitle="Private access information will be released only to the authorized Guest at the appropriate Booking state."
        title="Everything you need, before you land."
      />
      <div className="checkin-locked">
        <span className="lock-orb">
          <LockKeyhole size={30} />
        </span>
        <span className="preview-badge">Not implemented in the hackathon baseline</span>
        <h2>Check-in details stay locked.</h2>
        <p>
          Production delivery needs encrypted storage, state-gated release, access auditing, and
          recovery. The demo never publishes a fake door code or Wi-Fi password.
        </p>
        <div className="locked-rows">
          <span>
            <KeyRound size={17} /> Entry instructions
          </span>
          <span>
            <WalletCards size={17} /> Arrival confirmation
          </span>
          <span>
            <ShieldCheck size={17} /> Escrow release policy
          </span>
        </div>
      </div>
    </section>
  );
}

function PageTop({
  eyebrow,
  onBack,
  subtitle,
  title,
}: {
  eyebrow: string;
  onBack: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="page-top">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <p className="flow-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function AssuranceRow({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div className="assurance-row">
      {icon}
      <div>
        <strong>{label}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function StatusStep({
  active = false,
  complete = false,
  label,
  text,
}: {
  active?: boolean;
  complete?: boolean;
  label: string;
  text: string;
}) {
  return (
    <li className={`${active ? 'active' : ''} ${complete ? 'complete' : ''}`}>
      <span>{complete ? <Check size={13} /> : active ? <LoaderCircle size={13} /> : null}</span>
      <div>
        <strong>{label}</strong>
        <small>{text}</small>
      </div>
    </li>
  );
}

function EvidenceRow({
  demo = false,
  label,
  live = false,
  value,
}: {
  demo?: boolean;
  label: string;
  live?: boolean;
  value: string;
}) {
  return (
    <div className="evidence-row">
      <span className={`evidence-dot ${live ? 'live' : ''} ${demo ? 'demo' : ''}`} />
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
      <span className={`evidence-state ${live ? 'live' : ''} ${demo ? 'demo' : ''}`}>
        {demo ? 'Demo' : live ? 'Live' : 'Pending'}
      </span>
    </div>
  );
}

function SuccessMark() {
  return (
    <span className="success-mark">
      <Check size={34} />
    </span>
  );
}

function InlineError({ error }: { error: NookApiError }) {
  return (
    <div className="inline-error" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>We couldn’t complete that step.</strong>
        <p>{friendlyError(error)}</p>
        {error.requestId && <small>Reference: {error.requestId}</small>}
      </div>
    </div>
  );
}

function EmptyState({ icon, text, title }: { icon: ReactNode; text: string; title: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
