import type {
  AgentResult,
  GuestSearchIntentPort,
  ListingDraft,
  ListingDraftInput,
  ListingDraftPort,
  ListingRankingPort,
  ListingRecommendation,
} from '@nook-rent/core';

const DATE_PATTERN = /\b20\d{2}-\d{2}-\d{2}\b/g;
const CITY_PATTERN =
  /\b(?:in|near)\s+([a-zà-ÿ][a-zà-ÿ' -]*?)(?=\s+(?:between|from|for|under|up to|with)\b|[,.;]|$)/i;
const GUEST_PATTERN = /\b(\d+)\s+guests?\b/i;
const BUDGET_PATTERN = /\b(?:under|up to|max(?:imum)?(?: of)?|budget(?: of)?)\s+(\d+)\b/i;
const AMENITIES_PATTERN = /\bwith\s+([a-zà-ÿ][a-zà-ÿ, '&-]*?)(?=[.;]|$)/i;

function cleanList(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
    ),
  ];
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

function fallback<T>(value: T): AgentResult<T> {
  return {
    value,
    execution: {
      provider: 'deterministic',
      mode: 'fallback',
    },
  };
}

export class DeterministicMarketplaceAgents
  implements ListingDraftPort, GuestSearchIntentPort, ListingRankingPort
{
  createDraft(input: ListingDraftInput): Promise<AgentResult<ListingDraft>> {
    const facts = input.hostFacts;
    const confirmedAmenities = cleanList(facts.confirmedAmenities);
    const highlightText = facts.highlights.join(' ').toLowerCase();
    const suggestedAmenities = cleanList([
      ...(highlightText.includes('work') && !confirmedAmenities.includes('workspace')
        ? ['workspace']
        : []),
    ]);
    const highlights =
      facts.highlights.length > 0
        ? facts.highlights.join(', ')
        : `a comfortable ${facts.propertyType.toLowerCase()}`;
    const amenityText =
      confirmedAmenities.length > 0
        ? ` Confirmed amenities include ${confirmedAmenities.join(', ')}.`
        : '';

    return Promise.resolve(
      fallback({
        title: `${capitalize(facts.propertyType)} in ${facts.neighborhood}`,
        description: `${capitalize(highlights)} in ${facts.neighborhood}, ${facts.city}, for up to ${facts.maxGuests} guests.${amenityText}`,
        suggestedAmenities,
        inferredFields: ['title', 'description', 'suggestedAmenities'],
      }),
    );
  }

  interpretSearch(input: { query: string }) {
    const dates = input.query.match(DATE_PATTERN) ?? [];
    const city = CITY_PATTERN.exec(input.query)?.[1]?.trim();
    const guests = Number(GUEST_PATTERN.exec(input.query)?.[1]);
    const maximumNightlyRateAtomic = BUDGET_PATTERN.exec(input.query)?.[1];
    const amenities = AMENITIES_PATTERN.exec(input.query)?.[1]
      ?.split(/,|\band\b/i)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!city || dates.length < 2 || !Number.isSafeInteger(guests) || guests < 1) {
      return Promise.resolve(
        fallback({
          status: 'needs_clarification' as const,
          question: 'Which city, check-in date, check-out date, and number of guests should I use?',
        }),
      );
    }

    return Promise.resolve(
      fallback({
        status: 'ready' as const,
        city: capitalize(city),
        checkIn: dates[0]!,
        checkOut: dates[1]!,
        guests,
        ...(maximumNightlyRateAtomic ? { maximumNightlyRateAtomic } : {}),
        requiredAmenities: cleanList(amenities ?? []),
      }),
    );
  }

  rankListings(input: Parameters<ListingRankingPort['rankListings']>[0]) {
    const sorted = [...input.candidates].sort((first, second) => {
      const priceDifference = BigInt(first.nightlyRateAtomic) - BigInt(second.nightlyRateAtomic);

      return priceDifference === 0n
        ? first.id.localeCompare(second.id)
        : priceDifference < 0n
          ? -1
          : 1;
    });
    const recommendations: ListingRecommendation[] = sorted.map((candidate) => ({
      listingId: candidate.id,
      summary: `${candidate.title} is a valid match in ${candidate.neighborhood}.`,
      matchReasons: [
        'Dates and occupancy are available',
        ...(input.interpretation.requiredAmenities.length > 0
          ? [`Includes ${input.interpretation.requiredAmenities.join(', ')}`]
          : []),
        `Nightly amount ${candidate.nightlyRateAtomic}`,
      ],
    }));

    return Promise.resolve(fallback(recommendations));
  }
}
