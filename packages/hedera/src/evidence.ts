import { type Client, TopicMessageSubmitTransaction, TransactionId } from '@hashgraph/sdk';
import type { RentalEvidencePort } from '@nook-rent/core';

import type { HederaEnvironment } from './environment.js';
import { executeReservedTransaction, requireReceiptValue } from './sdk-helpers.js';
import type { HederaMirrorNode } from './mirror-node.js';

interface EvidenceEnvelope {
  version: 1;
  eventId: string;
  type: string;
  occurredAt: string;
  subjectRef: string;
  payload: Record<string, string | number | boolean>;
}

const forbiddenFieldPattern =
  /(address|door|identity|nullifier|profile|world|email|phone|instruction)/i;

function evidenceEnvelope(input: Parameters<RentalEvidencePort['publish']>[0]): EvidenceEnvelope {
  const envelope: EvidenceEnvelope = {
    version: 1,
    eventId: input.eventId,
    type: input.eventType,
    occurredAt: input.occurredAt,
    subjectRef: input.subjectRef,
    payload: input.payload,
  };
  const fieldNames = [...Object.keys(envelope), ...Object.keys(envelope.payload)];

  if (fieldNames.some((field) => forbiddenFieldPattern.test(field))) {
    throw new Error('HCS evidence contains a forbidden private-data field');
  }

  const encoded = JSON.stringify(envelope);

  if (Buffer.byteLength(encoded, 'utf8') > 900) {
    throw new Error('HCS evidence exceeds the Nook.rent message limit');
  }

  return envelope;
}

export class HederaRentalEvidence implements RentalEvidencePort {
  private readonly reservations = new Map<string, string>();

  constructor(
    private readonly environment: HederaEnvironment,
    private readonly client: Client,
    private readonly mirror: HederaMirrorNode,
  ) {}

  reserveTransactionId(operationId: string): Promise<string> {
    const existing = this.reservations.get(operationId);

    if (existing) {
      return Promise.resolve(existing);
    }

    const transactionId = TransactionId.generate(this.environment.operatorAccountId).toString();
    this.reservations.set(operationId, transactionId);
    return Promise.resolve(transactionId);
  }

  async publish(input: Parameters<RentalEvidencePort['publish']>[0]): Promise<{
    transactionId: string;
    sequenceNumber: number;
  }> {
    const envelope = evidenceEnvelope(input);
    const confirmed = await executeReservedTransaction(
      new TopicMessageSubmitTransaction()
        .setTopicId(this.environment.topicId)
        .setMessage(JSON.stringify(envelope))
        .setTransactionMemo('Nook.rent HCS evidence'),
      input.submissionTransactionId,
      this.client,
    );

    if (confirmed.receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`HCS submission failed with ${confirmed.receipt.status.toString()}`);
    }

    const sequenceNumber = Number(
      requireReceiptValue(confirmed.receipt.topicSequenceNumber, 'HCS sequence number').toString(),
    );
    const mirrored = await this.mirror.waitForTopicMessage({
      topicId: this.environment.topicId.toString(),
      sequenceNumber,
    });

    if (JSON.stringify(mirrored.parsedMessage) !== JSON.stringify(envelope)) {
      throw new Error('Mirror Node HCS evidence does not match the submitted event');
    }

    return {
      transactionId: confirmed.transactionId,
      sequenceNumber,
    };
  }
}

export function createEvidenceEnvelopeForTest(
  input: Parameters<RentalEvidencePort['publish']>[0],
): EvidenceEnvelope {
  return evidenceEnvelope(input);
}
