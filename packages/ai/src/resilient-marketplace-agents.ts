import type {
  AgentExecution,
  AgentResult,
  GuestSearchIntentPort,
  ListingDraftPort,
  ListingRankingPort,
} from '@nook-rent/core';
import { ZodError } from 'zod';

function fallbackReason(error: unknown): NonNullable<AgentExecution['fallbackReason']> {
  if (error instanceof ZodError) {
    return 'invalid_output';
  }

  if (
    error instanceof Error &&
    /(?:connection|timeout|unavailable|network|rate limit)/i.test(error.message)
  ) {
    return 'provider_unavailable';
  }

  return 'provider_error';
}

function withReason<T>(
  result: AgentResult<T>,
  reason: NonNullable<AgentExecution['fallbackReason']>,
): AgentResult<T> {
  return {
    ...result,
    execution: {
      ...result.execution,
      fallbackReason: reason,
    },
  };
}

export class ResilientMarketplaceAgents
  implements ListingDraftPort, GuestSearchIntentPort, ListingRankingPort
{
  constructor(
    private readonly primary: ListingDraftPort & GuestSearchIntentPort & ListingRankingPort,
    private readonly fallback: ListingDraftPort & GuestSearchIntentPort & ListingRankingPort,
  ) {}

  async createDraft(input: Parameters<ListingDraftPort['createDraft']>[0]) {
    try {
      return await this.primary.createDraft(input);
    } catch (error) {
      return withReason(await this.fallback.createDraft(input), fallbackReason(error));
    }
  }

  async interpretSearch(input: Parameters<GuestSearchIntentPort['interpretSearch']>[0]) {
    try {
      return await this.primary.interpretSearch(input);
    } catch (error) {
      return withReason(await this.fallback.interpretSearch(input), fallbackReason(error));
    }
  }

  async rankListings(input: Parameters<ListingRankingPort['rankListings']>[0]) {
    try {
      return await this.primary.rankListings(input);
    } catch (error) {
      return withReason(await this.fallback.rankListings(input), fallbackReason(error));
    }
  }
}
