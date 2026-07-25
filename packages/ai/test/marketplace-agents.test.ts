import type { GuestSearchIntentPort, ListingDraftPort, ListingRankingPort } from '@nook-rent/core';
import { describe, expect, it } from 'vitest';

import {
  DeterministicMarketplaceAgents,
  parseGuestSearchInterpretation,
  parseHostListingDraft,
  ResilientMarketplaceAgents,
} from '../src/index.js';

const listingDraftInput = {
  hostFacts: {
    city: 'Lisbon',
    neighborhood: 'Graça',
    propertyType: 'one-bedroom home',
    maxGuests: 2,
    confirmedAmenities: ['wifi', 'washer'],
    houseRules: ['No smoking'],
    highlights: ['calm courtyard', 'work corner'],
  },
  imageRefs: [],
};

describe('constrained marketplace Agents', () => {
  it('creates a review-only deterministic Host draft from public facts', async () => {
    const agents = new DeterministicMarketplaceAgents();
    const result = await agents.createDraft(listingDraftInput);

    expect(result.execution).toMatchObject({
      provider: 'deterministic',
      mode: 'fallback',
    });
    expect(result.value.title).toContain('Graça');
    expect(result.value.description).toContain('Lisbon');
    expect(result.value.inferredFields).toContain('suggestedAmenities');
    expect(result.value.description).not.toMatch(/deposit|door code|per night/i);
  });

  it('extracts complete Guest filters and asks when required facts are missing', async () => {
    const agents = new DeterministicMarketplaceAgents();

    const ready = await agents.interpretSearch({
      query:
        'Find me a stay in Lisbon from 2026-08-20 to 2026-08-25 for 2 guests under 15000 with wifi and desk.',
    });
    expect(ready.value).toEqual({
      status: 'ready',
      city: 'Lisbon',
      checkIn: '2026-08-20',
      checkOut: '2026-08-25',
      guests: 2,
      maximumNightlyRateAtomic: '15000',
      requiredAmenities: ['wifi', 'desk'],
    });

    const incomplete = await agents.interpretSearch({
      query: 'Find me somewhere quiet.',
    });
    expect(incomplete.value).toMatchObject({
      status: 'needs_clarification',
    });
  });

  it('falls back without leaking the provider error', async () => {
    const primary = {
      createDraft: () => Promise.reject(new Error('provider secret response')),
      interpretSearch: () => Promise.reject(new Error('network unavailable')),
      rankListings: () => Promise.reject(new Error('provider secret response')),
    } satisfies ListingDraftPort & GuestSearchIntentPort & ListingRankingPort;
    const agents = new ResilientMarketplaceAgents(primary, new DeterministicMarketplaceAgents());

    const result = await agents.createDraft(listingDraftInput);

    expect(result.execution).toEqual({
      provider: 'deterministic',
      mode: 'fallback',
      fallbackReason: 'provider_error',
    });
    expect(JSON.stringify(result)).not.toContain('provider secret response');
  });

  it('rejects output fields that could smuggle financial authority', () => {
    expect(() =>
      parseHostListingDraft({
        title: 'A calm home',
        description: 'Public facts only.',
        suggestedAmenities: [],
        inferredFields: ['title'],
        depositAmountAtomic: '1',
      }),
    ).toThrow();
  });

  it('rejects a ready interpretation without all hard filters', () => {
    expect(() =>
      parseGuestSearchInterpretation({
        status: 'ready',
        question: null,
        city: 'Lisbon',
        checkIn: null,
        checkOut: null,
        guests: 1,
        maximumNightlyRateAtomic: null,
        requiredAmenities: [],
      }),
    ).toThrow('ready search interpretation');
  });
});
