import { randomUUID } from 'node:crypto';

import { parseDatabaseEnvironment, parseServerEnvironment } from '@nook-rent/config';
import { MarketplaceService } from '@nook-rent/core';
import {
  createPostgresClient,
  PostgresAvailabilityWindowRepository,
  PostgresBookingQuoteRepository,
  PostgresBookingRepository,
  PostgresBookingRequestRepository,
  PostgresListingApprovalPolicyRepository,
  PostgresListingRepository,
  PostgresMemberProfileRepository,
  PostgresRentalReputationRepository,
  PostgresReservationHoldRepository,
} from '@nook-rent/supabase';

import { createApi } from './api.js';

const serverEnvironment = parseServerEnvironment(process.env);
const databaseEnvironment = parseDatabaseEnvironment(process.env);
const sql = createPostgresClient(databaseEnvironment.connectionString);
const marketplace = new MarketplaceService({
  profiles: new PostgresMemberProfileRepository(sql),
  listings: new PostgresListingRepository(sql),
  availability: new PostgresAvailabilityWindowRepository(sql),
  approvalPolicies: new PostgresListingApprovalPolicyRepository(sql),
  quotes: new PostgresBookingQuoteRepository(sql),
  holds: new PostgresReservationHoldRepository(sql),
  bookingRequests: new PostgresBookingRequestRepository(sql),
  bookings: new PostgresBookingRepository(sql),
  reputation: new PostgresRentalReputationRepository(sql),
  clock: {
    now: () => new Date().toISOString(),
  },
  ids: {
    next: () => randomUUID(),
  },
});
const app = createApi({
  logger: serverEnvironment.nodeEnvironment !== 'test',
  allowedOrigins: serverEnvironment.allowedOrigins,
  marketplace,
  readiness: async () => {
    await sql`select 1`;
  },
});

app.addHook('onClose', async () => {
  await sql.end();
});

async function start(): Promise<void> {
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

void start();
