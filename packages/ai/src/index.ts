import type { GuestSearchIntentPort, ListingDraftPort, ListingRankingPort } from '@nook-rent/core';

import { DeterministicMarketplaceAgents } from './deterministic-marketplace-agents.js';
import type { AiEnvironment } from './environment.js';
import { OpenAiMarketplaceAgents } from './openai-marketplace-agents.js';
import { ResilientMarketplaceAgents } from './resilient-marketplace-agents.js';

export * from './deterministic-marketplace-agents.js';
export * from './environment.js';
export * from './openai-marketplace-agents.js';
export * from './resilient-marketplace-agents.js';
export * from './schemas.js';

export type MarketplaceAgentPorts = ListingDraftPort & GuestSearchIntentPort & ListingRankingPort;

export function createMarketplaceAgentPorts(
  environment: AiEnvironment | undefined,
): MarketplaceAgentPorts {
  const fallback = new DeterministicMarketplaceAgents();

  if (!environment) {
    return fallback;
  }

  return new ResilientMarketplaceAgents(new OpenAiMarketplaceAgents(environment), fallback);
}
