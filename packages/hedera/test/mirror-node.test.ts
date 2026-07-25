import { describe, expect, it, vi } from 'vitest';

import {
  decodeMirrorTopicMessage,
  HederaMirrorNode,
  mirrorTransactionId,
} from '../src/mirror-node.js';

function response(input: { body?: unknown; ok: boolean; status: number }) {
  return {
    ok: input.ok,
    status: input.status,
    json: () => Promise.resolve(input.body),
  };
}

describe('Hedera Mirror Node', () => {
  it('normalizes SDK transaction IDs for the REST API', () => {
    expect(mirrorTransactionId('0.0.1001@1784980800.000000001')).toBe(
      '0.0.1001-1784980800-000000001',
    );
  });

  it('maps confirmed, pending, and failed transaction results', async () => {
    const confirmed = new HederaMirrorNode('https://mirror.example', {
      fetchImplementation: () =>
        Promise.resolve(
          response({
            ok: true,
            status: 200,
            body: { transactions: [{ result: 'SUCCESS' }] },
          }),
        ),
    });
    const pending = new HederaMirrorNode('https://mirror.example', {
      fetchImplementation: () => Promise.resolve(response({ ok: false, status: 404 })),
    });
    const failed = new HederaMirrorNode('https://mirror.example', {
      fetchImplementation: () =>
        Promise.resolve(
          response({
            ok: true,
            status: 200,
            body: { transactions: [{ result: 'INSUFFICIENT_TOKEN_BALANCE' }] },
          }),
        ),
    });

    await expect(confirmed.getTransactionStatus('transaction')).resolves.toBe('confirmed');
    await expect(pending.getTransactionStatus('transaction')).resolves.toBe('pending');
    await expect(failed.getTransactionStatus('transaction')).resolves.toBe('failed');
  });

  it('waits for and decodes an HCS message', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: false, status: 404 }))
      .mockResolvedValueOnce(
        response({
          ok: true,
          status: 200,
          body: {
            consensus_timestamp: '1784980800.000000001',
            message: Buffer.from(JSON.stringify({ version: 1 })).toString('base64'),
            sequence_number: 14,
            topic_id: '0.0.8001',
          },
        }),
      );
    const mirror = new HederaMirrorNode('https://mirror.example', {
      fetchImplementation,
      sleep: () => Promise.resolve(),
    });

    const message = await mirror.waitForTopicMessage({
      topicId: '0.0.8001',
      sequenceNumber: 14,
      attempts: 2,
    });

    expect(message.parsedMessage).toEqual({ version: 1 });
    expect(message.sequenceNumber).toBe(14);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed Mirror topic messages', () => {
    expect(() =>
      decodeMirrorTopicMessage({
        consensus_timestamp: '1784980800.000000001',
        message: '',
        sequence_number: 1,
        topic_id: '0.0.8001',
      }),
    ).toThrow('message');
  });
});
