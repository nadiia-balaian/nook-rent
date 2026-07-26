import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresClient, type PostgresClient } from '../src/client.js';
import { applyMigrations } from '../src/migrations.js';
import { PostgresMemberSessionRepository } from '../src/repositories.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const SESSION_ONE_ID = '90000000-0000-4000-8000-000000000001';
const SESSION_TWO_ID = '90000000-0000-4000-8000-000000000002';
const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const NOW = '2026-07-26T00:00:00.000Z';
const EXPIRES_AT = '2099-07-26T00:00:00.000Z';
const WORLD_SESSION_ID = `session_${'a'.repeat(128)}`;

function worldVerification(sessionNullifierDecimal: string, worldSessionId = WORLD_SESSION_ID) {
  return {
    provider: 'world_id' as const,
    credential: 'proof_of_human' as const,
    action: 'nook-member-session',
    environment: 'staging' as const,
    protocolVersion: '4.0' as const,
    worldSessionId,
    sessionNullifierDecimal,
    verifiedAt: NOW,
  };
}

describeWithDatabase('Postgres Member session repository', () => {
  let sql: PostgresClient;
  let repository: PostgresMemberSessionRepository;

  beforeAll(async () => {
    sql = createPostgresClient(databaseUrl ?? '', { maxConnections: 5 });
    await applyMigrations(sql);
    repository = new PostgresMemberSessionRepository(sql);
  });

  beforeEach(async () => {
    await sql`
      truncate table
        nook.world_id_session_proofs,
        nook.member_sessions,
        nook.world_id_verifications,
        nook.profiles
      cascade
    `;
  });

  afterAll(async () => {
    await sql.end();
  });

  it('finds an active session only by its hashed opaque token', async () => {
    const created = await repository.create({
      id: SESSION_ONE_ID,
      tokenHash: 'a'.repeat(64),
      expiresAt: EXPIRES_AT,
    });

    expect(created).toMatchObject({
      id: SESSION_ONE_ID,
      humanVerified: false,
    });
    await expect(
      repository.findByTokenHash({
        tokenHash: 'a'.repeat(64),
        now: NOW,
      }),
    ).resolves.toMatchObject({ id: SESSION_ONE_ID });
    await expect(
      repository.findByTokenHash({
        tokenHash: 'b'.repeat(64),
        now: NOW,
      }),
    ).resolves.toBeUndefined();
  });

  it('reattaches a World session only after each Member session supplies a fresh proof', async () => {
    await repository.create({
      id: SESSION_ONE_ID,
      tokenHash: 'a'.repeat(64),
      expiresAt: EXPIRES_AT,
    });
    await repository.create({
      id: SESSION_TWO_ID,
      tokenHash: 'b'.repeat(64),
      expiresAt: EXPIRES_AT,
    });

    const first = await repository.authenticateWorldId({
      sessionId: SESSION_ONE_ID,
      newProfileId: PROFILE_ID,
      newProfilePublicRef: 'member-session-test',
      ...worldVerification('101'),
    });
    const pendingSecond = await repository.findByTokenHash({
      tokenHash: 'b'.repeat(64),
      now: NOW,
    });
    const second = await repository.authenticateWorldId({
      sessionId: SESSION_TWO_ID,
      newProfileId: '10000000-0000-4000-8000-000000000002',
      newProfilePublicRef: 'unused-member-session-test',
      ...worldVerification('102'),
    });

    expect(first.status).toBe('created');
    expect(first.session).toMatchObject({
      profileId: PROFILE_ID,
      humanVerified: true,
    });
    expect(pendingSecond).toMatchObject({
      id: SESSION_TWO_ID,
      humanVerified: false,
    });
    expect(second.status).toBe('existing');
    expect(second.session).toMatchObject({
      profileId: PROFILE_ID,
      humanVerified: true,
    });
  });

  it('does not let an authenticated session switch to another World identity', async () => {
    await repository.create({
      id: SESSION_ONE_ID,
      tokenHash: 'a'.repeat(64),
      expiresAt: EXPIRES_AT,
    });
    await repository.authenticateWorldId({
      sessionId: SESSION_ONE_ID,
      newProfileId: PROFILE_ID,
      newProfilePublicRef: 'member-session-test',
      ...worldVerification('101'),
    });

    await expect(
      repository.authenticateWorldId({
        sessionId: SESSION_ONE_ID,
        newProfileId: '10000000-0000-4000-8000-000000000002',
        newProfilePublicRef: 'unused-member-session-test',
        ...worldVerification('202', `session_${'b'.repeat(128)}`),
      }),
    ).rejects.toMatchObject({
      conflict: 'world_id_already_bound',
    });
  });

  it('rejects replaying one World session proof in another Member session', async () => {
    await repository.create({
      id: SESSION_ONE_ID,
      tokenHash: 'a'.repeat(64),
      expiresAt: EXPIRES_AT,
    });
    await repository.create({
      id: SESSION_TWO_ID,
      tokenHash: 'b'.repeat(64),
      expiresAt: EXPIRES_AT,
    });
    await repository.authenticateWorldId({
      sessionId: SESSION_ONE_ID,
      newProfileId: PROFILE_ID,
      newProfilePublicRef: 'member-session-test',
      ...worldVerification('101'),
    });

    await expect(
      repository.authenticateWorldId({
        sessionId: SESSION_TWO_ID,
        newProfileId: '10000000-0000-4000-8000-000000000002',
        newProfilePublicRef: 'unused-member-session-test',
        ...worldVerification('101'),
      }),
    ).rejects.toMatchObject({
      conflict: 'world_id_proof_replayed',
    });
  });
});
