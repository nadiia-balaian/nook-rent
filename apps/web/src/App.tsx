import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  Database,
  ExternalLink,
  Globe2,
  Home,
  LoaderCircle,
  MapPin,
  Network,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  XCircle,
} from 'lucide-react';
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';

import {
  type AgentExecution,
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
} from './api.js';
import {
  BOOKING_STEPS,
  DEFAULT_GUEST_QUERY,
  DEFAULT_SEARCH,
  DEMO_PROFILES,
  type DemoGuestKey,
} from './demo.js';

type DemoRole = 'guest' | 'host';
type ApiStatus = 'checking' | 'ready' | 'unavailable';
type BusyAction =
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
  highlights: 'calm courtyard, dedicated work corner',
  title: 'Sunny Graça home with a work corner',
  description:
    'A calm one-bedroom home for a short Lisbon stay, with fast Wi-Fi and a dedicated work corner.',
  city: 'Lisbon',
  neighborhood: 'Graça',
  approximateLocationRef: 'lisbon-graca-demo-area',
  amenities: 'wifi, desk, washer',
  houseRules: 'No smoking, Quiet after 22:00',
  nightlyRateAtomic: '11000',
  baseDepositAtomic: '50000',
  maxGuests: 2,
  checkIn: '2026-09-05',
  checkOut: '2026-09-15',
};

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
      return 'The demo data is not ready yet. Ask the demo owner to initialize it.';
    case 'domain_validation_error':
    case 'validation_error':
      return 'Check the dates and details, then try again.';
    case 'booking_request_already_decided':
      return 'This request has already been decided.';
    case 'hedera_unavailable':
      return 'Hedera Testnet is not configured yet. Add the new Nook.rent Testnet resources to the API environment.';
    case 'human_backed_authorization_required':
      return 'A World-verified Guest Agent must authorize this hold. Use the Guest Agent flow, then try again.';
    case 'agent_not_human_backed':
      return 'World could not confirm that this Agent acts for a verified human.';
    case 'invalid_agentkit_proof':
      return 'The World AgentKit authorization is invalid or expired. Ask the Guest Agent to sign a fresh request.';
    case 'world_nonce_replayed':
      return 'This World authorization was already used. Ask the Guest Agent to sign a fresh request.';
    case 'human_active_hold_limit':
      return 'This verified human already has an active hold. Complete or release it before holding another home.';
    case 'world_unavailable':
      return 'World AgentKit is not configured on the API yet.';
    case 'agent_not_registered':
      return 'This human-backed Agent is not registered in the Agent0 registry yet.';
    case 'agent_registration_inactive':
      return 'This Agent0 registration is inactive.';
    case 'agent_capability_missing':
      return 'This Agent0 registration does not advertise the Nook.rent reservation capability.';
    case 'provider_timeout':
    case 'provider_unavailable':
    case 'invalid_provider_response':
      return 'The live Agent0 query through The Graph is temporarily unavailable. No dates were held.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
}

export function App() {
  const [role, setRole] = useState<DemoRole>('guest');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<NookApiError | null>(null);
  const [guestKey, setGuestKey] = useState<DemoGuestKey>('experiencedGuest');
  const [guestQuery, setGuestQuery] = useState(DEFAULT_GUEST_QUERY);
  const [guestAgentSearch, setGuestAgentSearch] = useState<GuestAgentSearchResult | null>(null);
  const [search, setSearch] = useState<SearchInput>({ ...DEFAULT_SEARCH });
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [reservation, setReservation] = useState<ReservationResult | null>(null);
  const [deposit, setDeposit] = useState<DepositResult | null>(null);
  const [listingDraft, setListingDraft] = useState(initialListingDraft);
  const [hostAgentDraft, setHostAgentDraft] = useState<HostAgentDraftResult | null>(null);
  const [createdListing, setCreatedListing] = useState<ListingDetail | null>(null);

  const selectedGuest = DEMO_PROFILES[guestKey];
  const quoteExpired = quote ? Date.parse(quote.expiresAt) <= Date.now() : false;

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

  const resetGuestFlow = (nextGuestKey = guestKey) => {
    setGuestKey(nextGuestKey);
    setSelectedListing(null);
    setQuote(null);
    setReservation(null);
    setDeposit(null);
    setGuestAgentSearch(null);
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

  const searchListings = async (event: FormEvent) => {
    event.preventDefault();
    setSelectedListing(null);
    setQuote(null);
    setReservation(null);
    setDeposit(null);

    const result = await runAction('search', () => nookApi.searchWithGuestAgent(guestQuery));

    if (!result) return;

    setGuestAgentSearch(result);
    if (result.status === 'needs_clarification') {
      setListings(null);
      return;
    }

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
  };

  const createQuote = async (listing: Listing) => {
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
    if (result) setQuote(result);
  };

  const reserveDates = async () => {
    if (!quote) return;

    const result = await runAction('reserve', () =>
      nookApi.requestReservation({
        quoteId: quote.id,
        idempotencyKey: `nook-ui-${quote.id}`,
      }),
    );
    if (result) setReservation(result);
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
    }
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
    if (result) setCreatedListing(result);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Nook.rent home">
          <span className="brand-mark">
            <Home size={17} strokeWidth={2.4} />
          </span>
          <span>Nook.rent</span>
        </a>

        <div className="role-switch" aria-label="Demo role">
          <button
            className={role === 'guest' ? 'active' : ''}
            type="button"
            onClick={() => setRole('guest')}
          >
            <Search size={15} />
            Guest
          </button>
          <button
            className={role === 'host' ? 'active' : ''}
            type="button"
            onClick={() => setRole('host')}
          >
            <Building2 size={15} />
            Host desk
            {reservation?.bookingRequest.status === 'pending' && (
              <span className="notification-dot" aria-label="Pending request" />
            )}
          </button>
        </div>

        <ApiStatusChip status={apiStatus} />
      </header>

      {apiStatus === 'unavailable' && (
        <div className="service-banner" role="alert">
          <div>
            <AlertTriangle size={18} />
            <span>
              <strong>The marketplace is unavailable.</strong> The API or database could not be
              reached.
            </span>
          </div>
          <button type="button" onClick={() => void checkApi()}>
            <RotateCcw size={15} />
            Retry
          </button>
        </div>
      )}

      <main id="top">
        {role === 'guest' ? (
          <GuestExperience
            busyAction={busyAction}
            deposit={deposit}
            error={error}
            guestKey={guestKey}
            guestQuery={guestQuery}
            guestAgentSearch={guestAgentSearch}
            listings={listings}
            quote={quote}
            quoteExpired={quoteExpired}
            reservation={reservation}
            search={search}
            selectedListing={selectedListing}
            onFundDeposit={fundDeposit}
            onGuestChange={resetGuestFlow}
            onQuote={createQuote}
            onReconcileDeposit={reconcileDeposit}
            onReserve={reserveDates}
            onSearch={searchListings}
            setGuestQuery={setGuestQuery}
            switchToHost={() => setRole('host')}
          />
        ) : (
          <HostExperience
            busyAction={busyAction}
            createdListing={createdListing}
            error={error}
            listingDraft={listingDraft}
            hostAgentDraft={hostAgentDraft}
            reservation={reservation}
            onCreateListing={createListing}
            onDecision={decideRequest}
            onPrepareListingDraft={prepareListingDraft}
            onPublishListing={publishListing}
            setListingDraft={setListingDraft}
            switchToGuest={() => setRole('guest')}
          />
        )}

        <EvidencePanel deposit={deposit} reservation={reservation} />
      </main>

      <footer>
        <span>Nook.rent · ETHGlobal Lisbon 2026</span>
        <span>3–90 night stays · Testnet-only settlement</span>
      </footer>
    </div>
  );
}

function ApiStatusChip({ status }: { status: ApiStatus }) {
  return (
    <div className={`api-chip ${status}`}>
      {status === 'checking' ? (
        <LoaderCircle className="spin" size={14} />
      ) : (
        <span className="status-dot" />
      )}
      {status === 'ready'
        ? 'Marketplace ready'
        : status === 'checking'
          ? 'Checking…'
          : 'Unavailable'}
    </div>
  );
}

interface GuestExperienceProps {
  busyAction: BusyAction;
  deposit: DepositResult | null;
  error: NookApiError | null;
  guestAgentSearch: GuestAgentSearchResult | null;
  guestKey: DemoGuestKey;
  guestQuery: string;
  listings: Listing[] | null;
  quote: BookingQuote | null;
  quoteExpired: boolean;
  reservation: ReservationResult | null;
  search: SearchInput;
  selectedListing: Listing | null;
  onFundDeposit: () => Promise<void>;
  onGuestChange: (guestKey: DemoGuestKey) => void;
  onQuote: (listing: Listing) => Promise<void>;
  onReconcileDeposit: () => Promise<void>;
  onReserve: () => Promise<void>;
  onSearch: (event: FormEvent) => Promise<void>;
  setGuestQuery: Dispatch<SetStateAction<string>>;
  switchToHost: () => void;
}

function GuestExperience(props: GuestExperienceProps) {
  const selectedGuest = DEMO_PROFILES[props.guestKey];

  return (
    <>
      <section className="guest-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles size={14} />
            Temporary stays, clearly coordinated
          </p>
          <h1>A home for the in-between.</h1>
          <p>
            Find a real place for 3–90 nights. Nook keeps dates, deposits, and approval rules
            explicit—while your Guest Agent handles the coordination.
          </p>
          <div className="hero-trust-row">
            <span>
              <ShieldCheck size={17} /> Human-backed actions
            </span>
            <span>
              <CalendarDays size={17} /> Dates held atomically
            </span>
            <span>
              <WalletCards size={17} /> Clear deposit terms
            </span>
          </div>
        </div>

        <form className="search-card" onSubmit={(event) => void props.onSearch(event)}>
          <div className="search-card-heading">
            <div>
              <span className="step-label">Guest Agent · Step 1</span>
              <h2>Where do you want to stay?</h2>
            </div>
            <Search size={23} />
          </div>

          <label className="field field-wide agent-query">
            <span>Describe the stay</span>
            <textarea
              required
              rows={3}
              value={props.guestQuery}
              onChange={(event) => props.setGuestQuery(event.target.value)}
            />
          </label>
          <p className="agent-boundary-note">
            The Agent may interpret and rank. Stored availability, price, and approval rules remain
            deterministic.
          </p>

          <label className="field field-wide">
            <span>Parsed city</span>
            <div className="input-with-icon">
              <MapPin size={16} />
              <input readOnly value={props.search.city} />
            </div>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Parsed check in</span>
              <input readOnly type="date" value={props.search.checkIn} />
            </label>
            <label className="field">
              <span>Parsed check out</span>
              <input readOnly type="date" value={props.search.checkOut} />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Parsed guests</span>
              <input readOnly type="number" value={props.search.guests} />
            </label>
            <label className="field">
              <span>Parsed max nightly · test units</span>
              <input readOnly value={props.search.maximumNightlyRateAtomic ?? ''} />
            </label>
          </div>

          <label className="field field-wide">
            <span>Parsed must-have amenities</span>
            <input readOnly value={props.search.amenities} />
          </label>

          <button className="primary-button search-button" disabled={props.busyAction !== null}>
            {props.busyAction === 'search' ? (
              <>
                <LoaderCircle className="spin" size={17} /> Searching valid dates…
              </>
            ) : (
              <>
                Show available homes <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
      </section>

      {props.guestAgentSearch?.status === 'needs_clarification' && (
        <section className="agent-clarification" aria-live="polite">
          <Sparkles size={19} />
          <div>
            <strong>The Guest Agent needs one detail.</strong>
            <p>{props.guestAgentSearch.question}</p>
          </div>
        </section>
      )}

      {props.guestAgentSearch?.status === 'ready' && (
        <div className="agent-run-status" aria-live="polite">
          <Sparkles size={15} />
          <span>
            {agentExecutionLabel(props.guestAgentSearch.agent.interpretation)}
            {props.guestAgentSearch.agent.ranking
              ? ` · ranking: ${agentExecutionLabel(props.guestAgentSearch.agent.ranking)}`
              : ''}
          </span>
        </div>
      )}

      <section className="persona-section" aria-labelledby="persona-heading">
        <div>
          <span className="step-label">Demo identity</span>
          <h2 id="persona-heading">Choose the approval path</h2>
        </div>
        <div className="persona-grid">
          {(['experiencedGuest', 'newcomerGuest'] as const).map((key) => {
            const guest = DEMO_PROFILES[key];
            const selected = props.guestKey === key;
            return (
              <button
                className={`persona-card ${selected ? 'selected' : ''}`}
                key={key}
                type="button"
                onClick={() => props.onGuestChange(key)}
              >
                <span className="avatar">{guest.name.slice(0, 1)}</span>
                <span>
                  <strong>{guest.name}</strong>
                  <small>{guest.label}</small>
                </span>
                {selected && (
                  <span className="selected-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="persona-note">
          {selectedGuest.tier === 'silver'
            ? 'This seeded Guest qualifies for automatic approval under the Host policy.'
            : 'A Newcomer is never treated as risky. Their request goes to the Host for review.'}
        </p>
      </section>

      {props.error && <ErrorCard error={props.error} />}

      {props.listings !== null && (
        <section className="results-section" aria-labelledby="results-heading">
          <div className="section-heading">
            <div>
              <span className="step-label">Guest Agent · Step 2</span>
              <h2 id="results-heading">
                {props.listings.length
                  ? `${props.listings.length} valid ${props.listings.length === 1 ? 'stay' : 'stays'}`
                  : 'No valid stays'}
              </h2>
            </div>
            <p>
              {formatDate(props.search.checkIn)} – {formatDate(props.search.checkOut)} ·{' '}
              {props.search.guests} guest{props.search.guests === 1 ? '' : 's'}
            </p>
          </div>

          {props.listings.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={23} />}
              title="Nothing matches those dates"
              text="Try a wider budget, fewer required amenities, or different dates."
            />
          ) : (
            <div className="listing-grid">
              {props.listings.map((listing, index) => (
                <article
                  className={`listing-card ${props.selectedListing?.id === listing.id ? 'selected' : ''}`}
                  key={listing.id}
                >
                  <div className={`listing-visual visual-${(index % 3) + 1}`}>
                    <span className="availability-badge">
                      <CheckCircle2 size={14} /> Dates available
                    </span>
                    <span className="visual-monogram">{listing.neighborhood.slice(0, 1)}</span>
                  </div>
                  <div className="listing-content">
                    <div className="listing-location">
                      <MapPin size={14} />
                      {listing.neighborhood}, {listing.city}
                    </div>
                    <h3>{listing.title}</h3>
                    <p>{listing.description}</p>
                    {props.guestAgentSearch?.status === 'ready' &&
                      (() => {
                        const recommendation = props.guestAgentSearch.items.find(
                          (item) => item.listing.id === listing.id,
                        );

                        return recommendation ? (
                          <div className="agent-match">
                            <span>
                              <Sparkles size={13} /> Agent match
                            </span>
                            <p>{recommendation.summary}</p>
                            <small>{recommendation.matchReasons.join(' · ')}</small>
                          </div>
                        ) : null;
                      })()}
                    <div className="amenity-row">
                      {listing.amenities.slice(0, 4).map((amenity) => (
                        <span key={amenity}>{amenity}</span>
                      ))}
                    </div>
                    <div className="listing-footer">
                      <div>
                        <strong>{formatAtomicUnits(listing.nightlyRateAtomic)}</strong>
                        <span> test units / night</span>
                      </div>
                      <button
                        className="secondary-button"
                        disabled={props.busyAction !== null}
                        type="button"
                        onClick={() => void props.onQuote(listing)}
                      >
                        {props.busyAction === 'quote' &&
                        props.selectedListing?.id === listing.id ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          'View quote'
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {props.quote && props.selectedListing && (
        <QuotePanel
          busyAction={props.busyAction}
          deposit={props.deposit}
          listing={props.selectedListing}
          quote={props.quote}
          quoteExpired={props.quoteExpired}
          reservation={props.reservation}
          onFundDeposit={props.onFundDeposit}
          onReconcileDeposit={props.onReconcileDeposit}
          onReserve={props.onReserve}
          switchToHost={props.switchToHost}
        />
      )}
    </>
  );
}

interface QuotePanelProps {
  busyAction: BusyAction;
  deposit: DepositResult | null;
  listing: Listing;
  quote: BookingQuote;
  quoteExpired: boolean;
  reservation: ReservationResult | null;
  onFundDeposit: () => Promise<void>;
  onReconcileDeposit: () => Promise<void>;
  onReserve: () => Promise<void>;
  switchToHost: () => void;
}

function QuotePanel(props: QuotePanelProps) {
  return (
    <section className="quote-layout" aria-labelledby="quote-heading">
      <div className="quote-card">
        <span className="step-label">Guest Agent · Step 3</span>
        <div className="quote-heading">
          <div>
            <h2 id="quote-heading">Review the exact terms</h2>
            <p>{props.listing.title}</p>
          </div>
          <span className={`quote-timer ${props.quoteExpired ? 'expired' : ''}`}>
            <Clock3 size={14} />
            {props.quoteExpired ? 'Quote expired' : 'Held for 15 minutes'}
          </span>
        </div>

        <dl className="quote-lines">
          <div>
            <dt>
              {formatAtomicUnits(props.quote.nightlyRateAtomic)} × {props.quote.nights} nights
            </dt>
            <dd>{formatAtomicUnits(props.quote.staySubtotalAtomic)}</dd>
          </div>
          <div>
            <dt>
              Deposit · <span className="tier-label">{props.quote.reputationTier}</span>
            </dt>
            <dd>{formatAtomicUnits(props.quote.quotedDepositAtomic)}</dd>
          </div>
          <div className="quote-total">
            <dt>Total due</dt>
            <dd>{formatAtomicUnits(props.quote.totalDueAtomic)} test units</dd>
          </div>
        </dl>

        <div className="policy-explanation">
          <ShieldCheck size={19} />
          <p>
            {props.quote.reputationTier === 'newcomer'
              ? 'Newcomers use a higher refundable deposit and a fair Host review path.'
              : 'Verified rental history qualifies this Guest for the standard deposit.'}
          </p>
        </div>

        {!props.reservation && (
          <button
            className="primary-button"
            disabled={props.quoteExpired || props.busyAction !== null}
            type="button"
            onClick={() => void props.onReserve()}
          >
            {props.busyAction === 'reserve' ? (
              <>
                <LoaderCircle className="spin" size={17} /> Reserving dates…
              </>
            ) : props.quoteExpired ? (
              'Quote expired—select the listing again'
            ) : (
              <>
                Reserve these dates <ArrowRight size={17} />
              </>
            )}
          </button>
        )}
      </div>

      {props.reservation && (
        <BookingStatusCard
          busyAction={props.busyAction}
          deposit={props.deposit}
          reservation={props.reservation}
          onFundDeposit={props.onFundDeposit}
          onReconcileDeposit={props.onReconcileDeposit}
          switchToHost={props.switchToHost}
        />
      )}
    </section>
  );
}

function BookingStatusCard({
  busyAction,
  deposit,
  reservation,
  onFundDeposit,
  onReconcileDeposit,
  switchToHost,
}: {
  busyAction: BusyAction;
  deposit: DepositResult | null;
  reservation: ReservationResult;
  onFundDeposit: () => Promise<void>;
  onReconcileDeposit: () => Promise<void>;
  switchToHost: () => void;
}) {
  const currentStatus = reservation.booking.status;
  const currentIndex = BOOKING_STEPS.findIndex((step) => step.status === currentStatus);
  const isRejected = currentStatus === 'rejected';

  return (
    <div className={`booking-card ${isRejected ? 'rejected' : ''}`}>
      <div className="booking-result-icon">
        {isRejected ? <XCircle size={25} /> : <CheckCircle2 size={25} />}
      </div>
      <span className="step-label">Reservation result</span>
      <h2>
        {isRejected
          ? 'Request declined'
          : currentStatus === 'approval_pending'
            ? 'Waiting for Maria'
            : currentStatus === 'confirmed'
              ? 'Booking confirmed on Hedera'
              : 'Approved—deposit is next'}
      </h2>
      <p>
        {isRejected
          ? 'The hold was released, so the dates are available again.'
          : currentStatus === 'approval_pending'
            ? 'The dates are safely held while the Host reviews this Newcomer request.'
            : currentStatus === 'confirmed'
              ? 'The Testnet deposit is funded and the Booking is confirmed.'
              : 'The Host policy approved this request. Fund the Testnet deposit to confirm.'}
      </p>

      <ol className="status-timeline">
        {BOOKING_STEPS.slice(0, 4).map((step, index) => {
          const complete = !isRejected && index < currentIndex;
          const active = !isRejected && index === currentIndex;
          return (
            <li
              className={`${complete ? 'complete' : ''} ${active ? 'active' : ''}`}
              key={step.status}
            >
              <span>{complete ? <Check size={13} /> : index + 1}</span>
              <small>{step.label}</small>
            </li>
          );
        })}
      </ol>

      <div className="hold-reference">
        <Clock3 size={15} />
        {isRejected || reservation.hold.status === 'released'
          ? 'Hold released—dates are available again'
          : reservation.hold.status === 'converted'
            ? 'Reservation Hold converted into a confirmed Booking'
            : `Hold active until ${new Date(reservation.hold.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}`}
      </div>

      {reservation.booking.status === 'approval_pending' && (
        <button className="secondary-button full-width" type="button" onClick={switchToHost}>
          Open Host review <ArrowRight size={16} />
        </button>
      )}

      {reservation.booking.status === 'awaiting_deposit' && !deposit && (
        <button
          className="primary-button full-width"
          disabled={busyAction !== null}
          type="button"
          onClick={() => void onFundDeposit()}
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

      {deposit &&
        ['pending', 'reserved', 'submitted', 'reconciling'].includes(deposit.operation.status) && (
          <div className="hedera-operation">
            <span>Hedera operation · {deposit.operation.status}</span>
            <p>
              The transaction identity is reserved. Mirror Node decides the final result before the
              Booking changes.
            </p>
            {deposit.operation.transactionUrl && (
              <a href={deposit.operation.transactionUrl} rel="noreferrer" target="_blank">
                View pending transaction <ExternalLink size={13} />
              </a>
            )}
            <button
              className="secondary-button full-width"
              disabled={busyAction !== null}
              type="button"
              onClick={() => void onReconcileDeposit()}
            >
              {busyAction === 'reconcile' ? (
                <>
                  <LoaderCircle className="spin" size={16} /> Checking Mirror Node…
                </>
              ) : (
                <>
                  Reconcile status <RotateCcw size={15} />
                </>
              )}
            </button>
          </div>
        )}

      {deposit?.operation.status === 'failed' && (
        <div className="hedera-operation failed">
          <strong>Deposit failed safely</strong>
          <p>The dates were released after Mirror Node confirmed the failure.</p>
        </div>
      )}

      {deposit?.operation.status === 'confirmed' && (
        <div className="hedera-operation confirmed">
          <strong>
            <CheckCircle2 size={15} /> Real Testnet evidence
          </strong>
          <p>
            {formatAtomicUnits(deposit.escrow.amountAtomic)} test units funded · token{' '}
            {deposit.escrow.tokenId}
          </p>
          <div className="evidence-links">
            {deposit.operation.transactionUrl && (
              <a href={deposit.operation.transactionUrl} rel="noreferrer" target="_blank">
                HTS transfer <ExternalLink size={13} />
              </a>
            )}
            {deposit.evidence.status === 'confirmed' && deposit.evidence.topicUrl && (
              <a href={deposit.evidence.topicUrl} rel="noreferrer" target="_blank">
                HCS #{deposit.evidence.sequenceNumber} <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface HostExperienceProps {
  busyAction: BusyAction;
  createdListing: ListingDetail | null;
  error: NookApiError | null;
  hostAgentDraft: HostAgentDraftResult | null;
  listingDraft: typeof initialListingDraft;
  reservation: ReservationResult | null;
  onCreateListing: () => Promise<void>;
  onDecision: (decision: 'approved' | 'rejected') => Promise<void>;
  onPrepareListingDraft: (event: FormEvent) => Promise<void>;
  onPublishListing: () => Promise<void>;
  setListingDraft: Dispatch<SetStateAction<typeof initialListingDraft>>;
  switchToGuest: () => void;
}

function HostExperience(props: HostExperienceProps) {
  const pendingReview =
    props.reservation?.bookingRequest.status === 'pending' ? props.reservation : null;

  return (
    <>
      <section className="host-header">
        <div>
          <p className="eyebrow">
            <Building2 size={14} /> Host desk
          </p>
          <h1>Welcome back, Maria.</h1>
          <p>Publish a home, review requests, and keep every approval decision explicit.</p>
        </div>
        <div className="host-stat">
          <span>Pending review</span>
          <strong>{pendingReview ? '1' : '0'}</strong>
        </div>
      </section>

      {props.error && <ErrorCard error={props.error} />}

      <section className="host-review-section" aria-labelledby="review-heading">
        <div className="section-heading">
          <div>
            <span className="step-label">Approval queue</span>
            <h2 id="review-heading">Requests needing you</h2>
          </div>
          <span className="policy-chip">
            <ShieldCheck size={14} /> Auto-approve Silver+
          </span>
        </div>

        {pendingReview ? (
          <article className="review-card">
            <div className="review-person">
              <span className="avatar large">{DEMO_PROFILES.newcomerGuest.name.slice(0, 1)}</span>
              <div>
                <span className="tier-badge">Newcomer</span>
                <h3>{DEMO_PROFILES.newcomerGuest.name} wants to stay</h3>
                <p>
                  {formatDate(pendingReview.hold.checkIn)} –{' '}
                  {formatDate(pendingReview.hold.checkOut)} · {pendingReview.hold.nights} nights
                </p>
              </div>
            </div>
            <div className="review-facts">
              <div>
                <span>Rental reputation</span>
                <strong>Newcomer</strong>
              </div>
              <div>
                <span>Deposit</span>
                <strong>{formatAtomicUnits(pendingReview.booking.depositAmountAtomic)}</strong>
              </div>
              <div>
                <span>Date protection</span>
                <strong>Hold active</strong>
              </div>
            </div>
            <div className="review-note">
              <ShieldCheck size={18} />
              <p>
                Missing history is not negative evidence. Ask what you need, then approve or decline
                explicitly.
              </p>
            </div>
            <div className="review-actions">
              <button
                className="danger-button"
                disabled={props.busyAction !== null}
                type="button"
                onClick={() => void props.onDecision('rejected')}
              >
                Decline
              </button>
              <button
                className="primary-button"
                disabled={props.busyAction !== null}
                type="button"
                onClick={() => void props.onDecision('approved')}
              >
                {props.busyAction === 'decide' ? (
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
          </article>
        ) : props.reservation &&
          ['approved', 'rejected'].includes(props.reservation.bookingRequest.status) ? (
          <div className="decision-complete">
            {props.reservation.bookingRequest.status === 'approved' ? (
              <CheckCircle2 size={25} />
            ) : (
              <XCircle size={25} />
            )}
            <div>
              <h3>
                Request{' '}
                {props.reservation.bookingRequest.status === 'approved' ? 'approved' : 'declined'}
              </h3>
              <p>The Guest’s Booking timeline has been updated.</p>
            </div>
            <button className="text-button" type="button" onClick={props.switchToGuest}>
              View Guest status <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <EmptyState
            icon={<CheckCircle2 size={23} />}
            title="Review queue is clear"
            text="Choose the Newcomer persona in Guest mode to create the manual-review path."
          />
        )}
      </section>

      <section className="listing-builder" aria-labelledby="builder-heading">
        <div className="builder-intro">
          <span className="step-label">Host Agent · Listing draft</span>
          <h2 id="builder-heading">Turn the facts into a clear offer</h2>
          <p>
            The Agent drafts only public copy from the facts below. You still control dates, price,
            deposit, amenities, and publication.
          </p>
          <ul className="builder-rules">
            <li>
              <Check size={15} /> Exact address stays private
            </li>
            <li>
              <Check size={15} /> Nothing publishes without confirmation
            </li>
            <li>
              <Check size={15} /> Approval threshold is stored policy
            </li>
          </ul>
        </div>

        <form
          className="listing-form"
          onSubmit={(event) => void props.onPrepareListingDraft(event)}
        >
          <div className="field-row">
            <label className="field">
              <span>Property type</span>
              <input
                required
                value={props.listingDraft.propertyType}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    propertyType: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-grow">
              <span>Public highlights · comma separated</span>
              <input
                required
                value={props.listingDraft.highlights}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    highlights: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field field-grow">
              <span>Listing title</span>
              <input
                required
                value={props.listingDraft.title}
                onChange={(event) =>
                  props.setListingDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Neighborhood</span>
              <input
                required
                value={props.listingDraft.neighborhood}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    neighborhood: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="field field-wide">
            <span>Description</span>
            <textarea
              required
              rows={3}
              value={props.listingDraft.description}
              onChange={(event) =>
                props.setListingDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <div className="field-row three-columns">
            <label className="field">
              <span>Nightly · test units</span>
              <input
                inputMode="numeric"
                required
                value={props.listingDraft.nightlyRateAtomic}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    nightlyRateAtomic: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Base deposit</span>
              <input
                inputMode="numeric"
                required
                value={props.listingDraft.baseDepositAtomic}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    baseDepositAtomic: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Max guests</span>
              <input
                min="1"
                required
                type="number"
                value={props.listingDraft.maxGuests}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    maxGuests: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Available from</span>
              <input
                required
                type="date"
                value={props.listingDraft.checkIn}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    checkIn: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Available until</span>
              <input
                required
                type="date"
                value={props.listingDraft.checkOut}
                onChange={(event) =>
                  props.setListingDraft((current) => ({
                    ...current,
                    checkOut: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="field field-wide">
            <span>Amenities · comma separated</span>
            <input
              value={props.listingDraft.amenities}
              onChange={(event) =>
                props.setListingDraft((current) => ({
                  ...current,
                  amenities: event.target.value,
                }))
              }
            />
          </label>

          <label className="field field-wide">
            <span>House rules · comma separated</span>
            <input
              value={props.listingDraft.houseRules}
              onChange={(event) =>
                props.setListingDraft((current) => ({
                  ...current,
                  houseRules: event.target.value,
                }))
              }
            />
          </label>

          <button className="primary-button" disabled={props.busyAction !== null}>
            {props.busyAction === 'prepare-listing-draft' ? (
              <>
                <LoaderCircle className="spin" size={17} /> Host Agent is drafting…
              </>
            ) : (
              <>
                Ask Host Agent to draft <Sparkles size={17} />
              </>
            )}
          </button>
        </form>

        {props.hostAgentDraft && !props.createdListing && (
          <article className="agent-draft-review">
            <div className="draft-preview-top">
              <span className="draft-status">
                <Clock3 size={14} /> Host confirmation required
              </span>
              <span>{agentExecutionLabel(props.hostAgentDraft.agent)}</span>
            </div>
            <h3>Review the Agent proposal</h3>
            <p>
              Title and description were placed back into the editable form. Suggested amenities
              stay unconfirmed until you add them yourself.
            </p>
            {props.hostAgentDraft.draft.suggestedAmenities.length > 0 && (
              <div className="agent-suggestions">
                <strong>Unconfirmed suggestions</strong>
                {props.hostAgentDraft.draft.suggestedAmenities.map((amenity) => (
                  <span key={amenity}>{amenity}</span>
                ))}
              </div>
            )}
            <button
              className="primary-button"
              disabled={props.busyAction !== null}
              type="button"
              onClick={() => void props.onCreateListing()}
            >
              {props.busyAction === 'create-listing' ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Saving reviewable draft…
                </>
              ) : (
                <>
                  Accept copy and save draft <Check size={17} />
                </>
              )}
            </button>
          </article>
        )}

        {props.createdListing && (
          <article className="draft-preview">
            <div className="draft-preview-top">
              <span className="draft-status">
                {props.createdListing.listing.status === 'published' ? (
                  <>
                    <CheckCircle2 size={14} /> Published
                  </>
                ) : (
                  <>
                    <Clock3 size={14} /> Awaiting Host confirmation
                  </>
                )}
              </span>
              <span>Agent draft preview</span>
            </div>
            <h3>{props.createdListing.listing.title}</h3>
            <p>{props.createdListing.listing.description}</p>
            <div className="draft-facts">
              <span>
                <MapPin size={14} /> {props.createdListing.listing.neighborhood}
              </span>
              <span>
                <Users size={14} /> Up to {props.createdListing.listing.maxGuests}
              </span>
              <span>
                <Coins size={14} />{' '}
                {formatAtomicUnits(props.createdListing.listing.nightlyRateAtomic)} / night
              </span>
            </div>
            {props.createdListing.listing.status === 'draft' && (
              <button
                className="primary-button"
                disabled={props.busyAction !== null}
                type="button"
                onClick={() => void props.onPublishListing()}
              >
                {props.busyAction === 'publish-listing' ? (
                  <>
                    <LoaderCircle className="spin" size={17} /> Publishing…
                  </>
                ) : (
                  <>
                    Confirm and publish <Check size={17} />
                  </>
                )}
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}

function ErrorCard({ error }: { error: NookApiError }) {
  return (
    <div className="error-card" role="alert">
      <AlertTriangle size={20} />
      <div>
        <strong>We couldn’t complete that step.</strong>
        <p>{friendlyError(error)}</p>
        {error.requestId && <small>Reference: {error.requestId}</small>}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function EvidencePanel({
  deposit,
  reservation,
}: {
  deposit: DepositResult | null;
  reservation: ReservationResult | null;
}) {
  const hederaLive = deposit?.operation.status === 'confirmed';
  const worldVerified = reservation?.authorization?.humanBacked === true;
  const graphVerified = reservation?.onchainSignal?.capabilityPresent === true;
  const evidence = [
    {
      icon: <Database size={18} />,
      name: 'Marketplace core',
      status: 'Live now',
      tone: 'live',
      detail: 'Supabase persistence, exact quotes, atomic holds, Host policy',
    },
    {
      icon: <Globe2 size={18} />,
      name: 'World',
      status: worldVerified ? 'Verified this hold' : 'AgentKit-ready',
      tone: worldVerified ? 'live' : 'ready',
      detail:
        'AgentKit challenge, signed-request verification, AgentBook lookup, nonce replay defense, and one-active-hold limit',
    },
    {
      icon: <Network size={18} />,
      name: 'The Graph',
      status: graphVerified ? 'Live this hold' : 'Checked at hold',
      tone: graphVerified ? 'live' : 'ready',
      detail:
        graphVerified && reservation?.onchainSignal
          ? `Agent0 on ${reservation.onchainSignal.network}; active registration and ${reservation.onchainSignal.requiredCapability}`
          : 'Server-side Agent0 registration, signing-wallet binding, and booking-capability check',
    },
    {
      icon: <Coins size={18} />,
      name: 'Hedera',
      status: hederaLive ? 'Live Testnet' : 'Testnet-ready',
      tone: hederaLive ? 'live' : 'ready',
      detail:
        hederaLive && deposit
          ? `${formatAtomicUnits(deposit.escrow.amountAtomic)} test units funded; HCS ${
              deposit.evidence.status === 'confirmed'
                ? `#${deposit.evidence.sequenceNumber}`
                : 'evidence pending'
            }`
          : 'Native HTS, Mirror Node, and HCS adapters; live evidence not run yet',
    },
  ];

  return (
    <section className="evidence-section" aria-labelledby="evidence-heading">
      <div className="section-heading">
        <div>
          <span className="step-label">Integration evidence</span>
          <h2 id="evidence-heading">One clear job for every layer</h2>
        </div>
        <p>No visual-only sponsor claims. Planned integrations stay labeled until they work.</p>
      </div>
      <div className="evidence-grid">
        {evidence.map((item) => (
          <article key={item.name}>
            <div className="evidence-icon">{item.icon}</div>
            <div>
              <div className="evidence-title">
                <h3>{item.name}</h3>
                <span className={item.tone}>{item.status}</span>
              </div>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
