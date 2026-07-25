import type {
  AgentResult,
  GuestSearchIntentPort,
  GuestSearchInterpretation,
  ListingDraft,
  ListingDraftInput,
  ListingDraftPort,
  ListingRankingPort,
  ListingRecommendation,
} from '@nook-rent/core';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';

import type { AiEnvironment } from './environment.js';
import {
  guestSearchInterpretationSchema,
  hostListingDraftSchema,
  listingRankingSchema,
  parseGuestSearchInterpretation,
  parseHostListingDraft,
  parseListingRecommendations,
} from './schemas.js';

const HOST_INSTRUCTIONS = `You draft a public Nook.rent temporary-stay Listing.
Use only supplied public Host facts and visible image evidence. Never invent facts.
Do not include an exact address, access instructions, door codes, pricing, deposits,
tokens, dates, approval language, or claims about the Host or Guest.
Keep unconfirmed image-derived amenities only in suggestedAmenities and mark
suggestedAmenities as inferred. The Host must review everything before publication.`;

const SEARCH_INSTRUCTIONS = `You translate one Nook.rent Guest request into typed search filters.
Do not infer missing city, dates, or occupancy. Ask one concise clarification question
when a required filter is absent or ambiguous. Dates must be YYYY-MM-DD. Amounts are
atomic Testnet units represented only as unsigned decimal strings. Never choose a
Listing, approval result, deposit, token, recipient, or payment action.`;

const RANKING_INSTRUCTIONS = `You rank only the supplied, already-valid Nook.rent Listings.
Return every supplied Listing exactly once, using only its exact listingId.
Explain matches from supplied public facts and filters. Never infer safety, identity,
reputation, approval, availability beyond the supplied candidates, or payment terms.`;

function live<T>(value: T, model: string): AgentResult<T> {
  return {
    value,
    execution: {
      provider: 'openai',
      mode: 'live',
      model,
    },
  };
}

export class OpenAiMarketplaceAgents
  implements ListingDraftPort, GuestSearchIntentPort, ListingRankingPort
{
  private readonly client: OpenAI;

  constructor(private readonly environment: AiEnvironment) {
    this.client = new OpenAI({
      apiKey: environment.apiKey,
      timeout: environment.timeoutMilliseconds,
      maxRetries: 0,
    });
  }

  async createDraft(input: ListingDraftInput): Promise<AgentResult<ListingDraft>> {
    const content: ResponseInputContent[] = [
      {
        type: 'input_text',
        text: JSON.stringify({
          task: 'Create a public Listing draft',
          hostFacts: input.hostFacts,
        }),
      },
      ...input.imageRefs.map((imageUrl): ResponseInputContent => ({
        type: 'input_image',
        detail: 'low',
        image_url: imageUrl,
      })),
    ];
    const response = await this.client.responses.parse({
      model: this.environment.model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 800,
      instructions: HOST_INSTRUCTIONS,
      input: [{ role: 'user', content }],
      text: {
        format: zodTextFormat(hostListingDraftSchema, 'nook_host_listing_draft'),
        verbosity: 'low',
      },
    });

    return live(parseHostListingDraft(response.output_parsed), this.environment.model);
  }

  async interpretSearch(input: { query: string }): Promise<AgentResult<GuestSearchInterpretation>> {
    const response = await this.client.responses.parse({
      model: this.environment.model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 500,
      instructions: SEARCH_INSTRUCTIONS,
      input: input.query,
      text: {
        format: zodTextFormat(guestSearchInterpretationSchema, 'nook_guest_search_interpretation'),
        verbosity: 'low',
      },
    });

    return live(parseGuestSearchInterpretation(response.output_parsed), this.environment.model);
  }

  async rankListings(
    input: Parameters<ListingRankingPort['rankListings']>[0],
  ): Promise<AgentResult<ListingRecommendation[]>> {
    const response = await this.client.responses.parse({
      model: this.environment.model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 1_200,
      instructions: RANKING_INSTRUCTIONS,
      input: JSON.stringify(input),
      text: {
        format: zodTextFormat(listingRankingSchema, 'nook_listing_ranking'),
        verbosity: 'low',
      },
    });

    return live(parseListingRecommendations(response.output_parsed), this.environment.model);
  }
}
