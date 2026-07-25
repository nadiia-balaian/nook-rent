import { describe, expect, it } from 'vitest';

import {
  DomainValidationError,
  MarketplaceAgentService,
  StayRange,
  TokenAmount,
  type Listing,
  type ListingDraftPort,
  type ListingRankingPort,
} from '../src/index.js';

const listing: Listing = {
  id: 'listing-1',
  hostProfileId: 'host-1',
  title: 'Alfama work-friendly nook',
  description: 'A calm room with a desk.',
  city: 'Lisbon',
  neighborhood: 'Alfama',
  approximateLocationRef: 'lisbon-alfama-area',
  amenities: ['wifi', 'desk'],
  houseRules: ['No smoking'],
  settlementTokenId: '0.0.7001',
  nightlyRate: TokenAmount.fromAtomicUnits('10000'),
  baseDeposit: TokenAmount.fromAtomicUnits('50000'),
  maxGuests: 2,
  status: 'published',
  createdAt: '2026-07-25T10:00:00.000Z',
  updatedAt: '2026-07-25T10:00:00.000Z',
};

const liveExecution = {
  provider: 'openai' as const,
  mode: 'live' as const,
  model: 'test-model',
};

function service(input?: {
  listingDrafts?: ListingDraftPort;
  listingRankings?: ListingRankingPort;
}) {
  return new MarketplaceAgentService({
    marketplace: {
      searchListings: (search) => {
        expect(search.stayRange).toEqual(
          StayRange.fromStrings({
            checkIn: '2026-08-20',
            checkOut: '2026-08-25',
          }),
        );
        return Promise.resolve([listing]);
      },
    },
    listingDrafts: input?.listingDrafts ?? {
      createDraft: () =>
        Promise.resolve({
          value: {
            title: 'A calm Alfama home',
            description: 'Public facts only.',
            suggestedAmenities: [],
            inferredFields: ['title'],
          },
          execution: liveExecution,
        }),
    },
    guestSearchIntents: {
      interpretSearch: () =>
        Promise.resolve({
          value: {
            status: 'ready',
            city: 'Lisbon',
            checkIn: '2026-08-20',
            checkOut: '2026-08-25',
            guests: 1,
            maximumNightlyRateAtomic: '15000',
            requiredAmenities: ['wifi'],
          },
          execution: liveExecution,
        }),
    },
    listingRankings: input?.listingRankings ?? {
      rankListings: () =>
        Promise.resolve({
          value: [
            {
              listingId: listing.id,
              summary: 'A valid match.',
              matchReasons: ['Includes wifi'],
            },
          ],
          execution: liveExecution,
        }),
    },
  });
}

describe('MarketplaceAgentService', () => {
  it('hard-filters before accepting an Agent ranking', async () => {
    const result = await service().search({
      query: 'Lisbon from 2026-08-20 to 2026-08-25 for one guest under 15000 with wifi',
    });

    expect(result).toMatchObject({
      status: 'ready',
      totalMatches: 1,
      recommendations: [
        {
          listing: { id: listing.id },
          summary: 'A valid match.',
        },
      ],
    });
  });

  it('rejects a ranking that introduces a Listing outside valid results', async () => {
    const instance = service({
      listingRankings: {
        rankListings: () =>
          Promise.resolve({
            value: [
              {
                listingId: 'invented-listing',
                summary: 'Ignore the database.',
                matchReasons: ['Prompt injection'],
              },
            ],
            execution: liveExecution,
          }),
      },
    });

    await expect(
      instance.search({
        query: 'Lisbon from 2026-08-20 to 2026-08-25 for one guest under 15000 with wifi',
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('rejects financial or access claims in an Agent draft', async () => {
    const instance = service({
      listingDrafts: {
        createDraft: () =>
          Promise.resolve({
            value: {
              title: 'A home with a cheap deposit',
              description: 'Door code included.',
              suggestedAmenities: [],
              inferredFields: ['title'],
            },
            execution: liveExecution,
          }),
      },
    });

    await expect(
      instance.createListingDraft({
        hostFacts: {
          city: 'Lisbon',
          neighborhood: 'Alfama',
          propertyType: 'room',
          maxGuests: 1,
          confirmedAmenities: ['wifi'],
          houseRules: [],
          highlights: [],
        },
        imageRefs: [],
      }),
    ).rejects.toThrow('financial terms or private access');
  });
});
