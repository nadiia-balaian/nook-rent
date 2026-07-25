import { randomUUID } from 'node:crypto';

import { createMarketplaceAgentPorts, parseOptionalAiEnvironment } from '@nook-rent/ai';
import { parseDatabaseEnvironment, parseServerEnvironment } from '@nook-rent/config';
import {
  BookingDepositService,
  MarketplaceAgentService,
  MarketplaceService,
} from '@nook-rent/core';
import {
  createHederaClient,
  HederaFinancialLedger,
  HederaMirrorNode,
  HederaRentalEvidence,
  parseOptionalHederaEnvironment,
} from '@nook-rent/hedera';
import {
  createPostgresClient,
  PostgresAvailabilityWindowRepository,
  PostgresBookingQuoteRepository,
  PostgresBookingRepository,
  PostgresBookingRequestRepository,
  PostgresDepositOperationRepository,
  PostgresListingApprovalPolicyRepository,
  PostgresListingRepository,
  PostgresMemberProfileRepository,
  PostgresRentalReputationRepository,
  PostgresReservationHoldRepository,
  PostgresWorldIdVerificationRepository,
} from '@nook-rent/supabase';
import {
  EvmWalletProofService,
  parseOptionalPoapEnvironment,
  PoapCompassHistoryReader,
} from '@nook-rent/poap';
import {
  Agent0GraphClient,
  EnsGraphClient,
  parseOptionalGraphEnvironment,
} from '@nook-rent/the-graph';
import {
  createWorldGuestAgentClient,
  parseOptionalWorldGuestAgentEnvironment,
  parseOptionalWorldIdEnvironment,
  parseOptionalWorldVerifierEnvironment,
  WorldAgentkitAuthorization,
  WorldIdMemberVerification,
} from '@nook-rent/world';
import Fastify from 'fastify';

import { createApi } from './api.js';
import { WalletEvidenceService } from './wallet-evidence.js';

const serverEnvironment = parseServerEnvironment(process.env);
const databaseEnvironment = parseDatabaseEnvironment(process.env);
const sql = createPostgresClient(databaseEnvironment.connectionString);
const bookings = new PostgresBookingRepository(sql);
const marketplace = new MarketplaceService({
  profiles: new PostgresMemberProfileRepository(sql),
  listings: new PostgresListingRepository(sql),
  availability: new PostgresAvailabilityWindowRepository(sql),
  approvalPolicies: new PostgresListingApprovalPolicyRepository(sql),
  quotes: new PostgresBookingQuoteRepository(sql),
  holds: new PostgresReservationHoldRepository(sql),
  bookingRequests: new PostgresBookingRequestRepository(sql),
  bookings,
  reputation: new PostgresRentalReputationRepository(sql),
  clock: {
    now: () => new Date().toISOString(),
  },
  ids: {
    next: () => randomUUID(),
  },
});
const aiEnvironment = parseOptionalAiEnvironment(process.env);
const marketplaceAgentPorts = createMarketplaceAgentPorts(aiEnvironment);
const marketplaceAgents = new MarketplaceAgentService({
  marketplace,
  listingDrafts: marketplaceAgentPorts,
  guestSearchIntents: marketplaceAgentPorts,
  listingRankings: marketplaceAgentPorts,
});
const hederaEnvironment = parseOptionalHederaEnvironment(process.env);
const worldEnvironment = parseOptionalWorldVerifierEnvironment(process.env);
const humanBackedAuthorization = worldEnvironment
  ? new WorldAgentkitAuthorization(worldEnvironment)
  : undefined;
const worldGuestAgentEnvironment = parseOptionalWorldGuestAgentEnvironment(process.env);
const worldGuestAgent = worldGuestAgentEnvironment
  ? createWorldGuestAgentClient({
      privateKey: worldGuestAgentEnvironment.agentWalletPrivateKey,
      resourceUri: worldGuestAgentEnvironment.resourceUri,
      ...(worldGuestAgentEnvironment.rpcUrl ? { rpcUrl: worldGuestAgentEnvironment.rpcUrl } : {}),
    })
  : undefined;
const worldIdEnvironment = parseOptionalWorldIdEnvironment(process.env);
const memberWorldId = worldIdEnvironment
  ? new WorldIdMemberVerification(worldIdEnvironment)
  : undefined;
const worldIdVerifications = worldIdEnvironment
  ? new PostgresWorldIdVerificationRepository(sql)
  : undefined;
const graphEnvironment = parseOptionalGraphEnvironment(process.env);
const agentRegistrationSignals = graphEnvironment
  ? new Agent0GraphClient(graphEnvironment)
  : undefined;
const poapEnvironment = parseOptionalPoapEnvironment(process.env);
const walletEvidence = poapEnvironment
  ? new WalletEvidenceService({
      history: new PoapCompassHistoryReader({
        ...(poapEnvironment.endpoint ? { endpoint: poapEnvironment.endpoint } : {}),
        ...(poapEnvironment.apiKey ? { apiKey: poapEnvironment.apiKey } : {}),
      }),
      proofs: new EvmWalletProofService({
        secret: poapEnvironment.challengeSecret,
        ttlSeconds: poapEnvironment.challengeTtlSeconds,
      }),
      ...(graphEnvironment
        ? {
            ens: new EnsGraphClient({
              apiKey: graphEnvironment.apiKey,
              subgraphId: graphEnvironment.ensSubgraphId,
              gatewayUrl: graphEnvironment.gatewayUrl,
              timeoutMs: graphEnvironment.timeoutMs,
            }),
          }
        : {}),
    })
  : undefined;
const hederaClient = hederaEnvironment ? createHederaClient(hederaEnvironment) : undefined;
const deposits =
  hederaEnvironment && hederaClient
    ? new BookingDepositService({
        bookings,
        operations: new PostgresDepositOperationRepository(sql),
        ledger: new HederaFinancialLedger(
          hederaEnvironment,
          hederaClient,
          new HederaMirrorNode(hederaEnvironment.mirrorNodeUrl),
        ),
        evidence: new HederaRentalEvidence(
          hederaEnvironment,
          hederaClient,
          new HederaMirrorNode(hederaEnvironment.mirrorNodeUrl),
        ),
        clock: {
          now: () => new Date().toISOString(),
        },
        ids: {
          next: () => randomUUID(),
        },
        escrowRecipientRef: hederaEnvironment.escrowAccountId.toString(),
      })
    : undefined;
const app = createApi({
  fastify: Fastify({
    logger: serverEnvironment.nodeEnvironment !== 'test',
  }),
  allowedOrigins: serverEnvironment.allowedOrigins,
  marketplace,
  marketplaceAgents,
  ...(deposits ? { deposits } : {}),
  ...(hederaEnvironment ? { hederaTopicId: hederaEnvironment.topicId.toString() } : {}),
  ...(humanBackedAuthorization && worldEnvironment
    ? {
        humanBackedAuthorization,
        worldResourceUri: worldEnvironment.resourceUri,
      }
    : {}),
  ...(worldGuestAgent ? { worldGuestAgent } : {}),
  ...(memberWorldId && worldIdVerifications ? { memberWorldId, worldIdVerifications } : {}),
  ...(agentRegistrationSignals && graphEnvironment
    ? {
        agentRegistrationSignals,
        requiredAgentCapability: graphEnvironment.requiredCapability,
      }
    : {}),
  ...(walletEvidence ? { walletEvidence } : {}),
  readiness: async () => {
    await sql`select 1`;
  },
});

app.addHook('onClose', async () => {
  hederaClient?.close();
  await sql.end();
});

async function startServer(): Promise<void> {
  try {
    await app.listen({
      host: serverEnvironment.apiHost,
      port: serverEnvironment.apiPort,
    });
  } catch (error) {
    app.log.error(error);
    await sql.end();
    process.exitCode = 1;
  }
}

void startServer();
