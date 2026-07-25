import { DomainValidationError } from './errors.js';
import type { Listing } from './entities.js';
import { StayRange } from './local-date.js';
import type { MarketplaceService } from './marketplace-service.js';
import type {
  AgentExecution,
  GuestSearchIntentPort,
  GuestSearchInterpretation,
  ListingDraft,
  ListingDraftInput,
  ListingDraftPort,
  ListingRankCandidate,
  ListingRankingPort,
  ListingRecommendation,
} from './ports.js';
import { TokenAmount } from './token-amount.js';

const MAX_RANKED_CANDIDATES = 20;
const PROHIBITED_DRAFT_CONTENT =
  /(?:\b(?:deposit|door code|exact address|lockbox|nightly rate|per night)\b|[€$£])/i;

export interface MarketplaceAgentServiceDependencies {
  marketplace: Pick<MarketplaceService, 'searchListings'>;
  listingDrafts: ListingDraftPort;
  guestSearchIntents: GuestSearchIntentPort;
  listingRankings: ListingRankingPort;
}

export type GuestAgentSearchResult =
  | {
      status: 'needs_clarification';
      question: string;
      interpretationExecution: AgentExecution;
    }
  | {
      status: 'ready';
      interpretation: Extract<GuestSearchInterpretation, { status: 'ready' }>;
      interpretationExecution: AgentExecution;
      rankingExecution?: AgentExecution;
      totalMatches: number;
      recommendations: Array<{
        listing: Listing;
        summary: string;
        matchReasons: string[];
      }>;
    };

function normalizeText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new DomainValidationError(`${field} is required`);
  }
  if (normalized.length > maximumLength) {
    throw new DomainValidationError(`${field} cannot exceed ${maximumLength} characters`);
  }

  return normalized;
}

function normalizeList(values: string[], field: string, limit: number, lowercase = true): string[] {
  if (values.length > limit) {
    throw new DomainValidationError(`${field} cannot contain more than ${limit} items`);
  }

  return [
    ...new Set(
      values
        .map((value) => normalizeText(value, field, 120))
        .map((value) => (lowercase ? value.toLowerCase() : value))
        .filter(Boolean),
    ),
  ];
}

function validateListingDraft(draft: ListingDraft): ListingDraft {
  const title = normalizeText(draft.title, 'Agent draft title', 140);
  const description = normalizeText(draft.description, 'Agent draft description', 2_000);

  if (PROHIBITED_DRAFT_CONTENT.test(`${title} ${description}`)) {
    throw new DomainValidationError(
      'Agent draft cannot contain financial terms or private access information',
    );
  }

  return {
    title,
    description,
    suggestedAmenities: normalizeList(draft.suggestedAmenities, 'suggestedAmenities', 12),
    inferredFields: [...new Set(draft.inferredFields)],
  };
}

function candidateFromListing(listing: Listing): ListingRankCandidate {
  return {
    id: listing.id,
    title: listing.title,
    city: listing.city,
    neighborhood: listing.neighborhood,
    amenities: listing.amenities,
    nightlyRateAtomic: listing.nightlyRate.toString(),
    maxGuests: listing.maxGuests,
  };
}

function validateRecommendations(
  recommendations: ListingRecommendation[],
  listings: Listing[],
): Array<{ listing: Listing; summary: string; matchReasons: string[] }> {
  const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
  const seen = new Set<string>();

  return recommendations.map((recommendation) => {
    const listing = listingsById.get(recommendation.listingId);

    if (!listing || seen.has(recommendation.listingId)) {
      throw new DomainValidationError(
        'Agent ranking must reference each valid Listing at most once and no other Listings',
      );
    }
    seen.add(recommendation.listingId);

    return {
      listing,
      summary: normalizeText(recommendation.summary, 'recommendation summary', 300),
      matchReasons: normalizeList(recommendation.matchReasons, 'matchReasons', 6, false),
    };
  });
}

export class MarketplaceAgentService {
  constructor(private readonly dependencies: MarketplaceAgentServiceDependencies) {}

  async createListingDraft(input: ListingDraftInput): Promise<{
    draft: ListingDraft;
    execution: AgentExecution;
  }> {
    const result = await this.dependencies.listingDrafts.createDraft(input);

    return {
      draft: validateListingDraft(result.value),
      execution: result.execution,
    };
  }

  async search(input: { query: string }): Promise<GuestAgentSearchResult> {
    const query = normalizeText(input.query, 'query', 1_000);
    const interpretationResult = await this.dependencies.guestSearchIntents.interpretSearch({
      query,
    });
    const interpretation = interpretationResult.value;

    if (interpretation.status === 'needs_clarification') {
      return {
        status: 'needs_clarification',
        question: normalizeText(interpretation.question, 'clarification question', 300),
        interpretationExecution: interpretationResult.execution,
      };
    }

    const stayRange = StayRange.fromStrings({
      checkIn: interpretation.checkIn,
      checkOut: interpretation.checkOut,
    });
    const requiredAmenities = normalizeList(
      interpretation.requiredAmenities,
      'requiredAmenities',
      12,
    );
    const normalizedInterpretation = {
      ...interpretation,
      city: normalizeText(interpretation.city, 'city', 120),
      requiredAmenities,
      ...(interpretation.maximumNightlyRateAtomic
        ? {
            maximumNightlyRateAtomic: TokenAmount.fromAtomicUnits(
              interpretation.maximumNightlyRateAtomic,
            ).toString(),
          }
        : {}),
    };
    const listings = await this.dependencies.marketplace.searchListings({
      city: normalizedInterpretation.city,
      stayRange,
      ...(normalizedInterpretation.maximumNightlyRateAtomic
        ? {
            maximumNightlyRate: TokenAmount.fromAtomicUnits(
              normalizedInterpretation.maximumNightlyRateAtomic,
            ),
          }
        : {}),
      guests: normalizedInterpretation.guests,
      requiredAmenities,
    });
    const candidates = listings.slice(0, MAX_RANKED_CANDIDATES);

    if (candidates.length === 0) {
      return {
        status: 'ready',
        interpretation: normalizedInterpretation,
        interpretationExecution: interpretationResult.execution,
        totalMatches: 0,
        recommendations: [],
      };
    }

    const rankingResult = await this.dependencies.listingRankings.rankListings({
      query,
      interpretation: normalizedInterpretation,
      candidates: candidates.map(candidateFromListing),
    });
    const recommendations = validateRecommendations(rankingResult.value, candidates);

    return {
      status: 'ready',
      interpretation: normalizedInterpretation,
      interpretationExecution: interpretationResult.execution,
      rankingExecution: rankingResult.execution,
      totalMatches: listings.length,
      recommendations,
    };
  }
}
