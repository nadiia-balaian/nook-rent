export type HederaMirrorTransactionStatus = 'pending' | 'confirmed' | 'failed' | 'unknown';

interface MirrorHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type MirrorFetch = (url: string) => Promise<MirrorHttpResponse>;
export type MirrorSleep = (milliseconds: number) => Promise<void>;

interface MirrorTransaction {
  result?: unknown;
  transaction_id?: unknown;
}

interface MirrorTransactionResponse {
  transactions?: unknown;
}

interface MirrorTopicMessageResponse {
  consensus_timestamp?: unknown;
  message?: unknown;
  sequence_number?: unknown;
  topic_id?: unknown;
}

export interface MirrorTopicMessage {
  consensusTimestamp: string;
  message: string;
  parsedMessage: unknown;
  sequenceNumber: number;
  topicId: string;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Mirror Node response is missing ${field}`);
  }

  return value;
}

function sequenceNumber(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('Mirror Node response has an invalid sequence number');
  }

  return parsed;
}

export function mirrorTransactionId(transactionId: string): string {
  const [accountId, validStart] = transactionId.split('@');

  if (!accountId || !validStart) {
    return transactionId;
  }

  const [seconds, nanos] = validStart.split('.');

  return seconds && nanos ? `${accountId}-${seconds}-${nanos}` : transactionId;
}

export function decodeMirrorTopicMessage(response: MirrorTopicMessageResponse): MirrorTopicMessage {
  const encodedMessage = nonEmptyString(response.message, 'message');
  const message = Buffer.from(encodedMessage, 'base64').toString('utf8');
  let parsedMessage: unknown = message;

  try {
    parsedMessage = JSON.parse(message) as unknown;
  } catch {
    // HCS also permits plain text. It remains available as the decoded message.
  }

  return {
    consensusTimestamp: nonEmptyString(response.consensus_timestamp, 'consensus_timestamp'),
    message,
    parsedMessage,
    sequenceNumber: sequenceNumber(response.sequence_number),
    topicId: nonEmptyString(response.topic_id, 'topic_id'),
  };
}

const defaultSleep: MirrorSleep = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export class HederaMirrorNode {
  private readonly fetchImplementation: MirrorFetch;
  private readonly sleep: MirrorSleep;

  constructor(
    private readonly baseUrl: string,
    options: {
      fetchImplementation?: MirrorFetch;
      sleep?: MirrorSleep;
    } = {},
  ) {
    this.fetchImplementation =
      options.fetchImplementation ??
      (async (url) => {
        return fetch(url);
      });
    this.sleep = options.sleep ?? defaultSleep;
  }

  async getTransactionStatus(transactionId: string): Promise<HederaMirrorTransactionStatus> {
    const url = this.url(`/api/v1/transactions/${mirrorTransactionId(transactionId)}`);
    const response = await this.fetchImplementation(url);

    if (response.status === 404) {
      return 'pending';
    }
    if (!response.ok) {
      return 'unknown';
    }

    const body = (await response.json()) as MirrorTransactionResponse;

    if (!Array.isArray(body.transactions)) {
      throw new Error('Mirror Node transaction response is missing transactions');
    }
    if (body.transactions.length === 0) {
      return 'pending';
    }

    const transactions = body.transactions as MirrorTransaction[];
    const results = transactions
      .map((transaction) =>
        typeof transaction.result === 'string' ? transaction.result.toUpperCase() : undefined,
      )
      .filter((result): result is string => Boolean(result));

    if (results.includes('SUCCESS')) {
      return 'confirmed';
    }

    return results.length > 0 ? 'failed' : 'unknown';
  }

  async waitForTopicMessage(input: {
    topicId: string;
    sequenceNumber: number;
    attempts?: number;
    initialDelayMs?: number;
  }): Promise<MirrorTopicMessage> {
    const attempts = input.attempts ?? 8;
    const initialDelayMs = input.initialDelayMs ?? 500;
    const url = this.url(`/api/v1/topics/${input.topicId}/messages/${input.sequenceNumber}`);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await this.fetchImplementation(url);

      if (response.ok) {
        return decodeMirrorTopicMessage((await response.json()) as MirrorTopicMessageResponse);
      }
      if (response.status !== 404) {
        throw new Error(`Mirror Node topic request failed with HTTP ${response.status}`);
      }
      if (attempt < attempts - 1) {
        await this.sleep(Math.min(initialDelayMs * 2 ** attempt, 4_000));
      }
    }

    throw new Error(
      `Mirror Node did not return topic ${input.topicId} sequence ${input.sequenceNumber}`,
    );
  }

  async read(path: string): Promise<unknown> {
    const response = await this.fetchImplementation(this.url(path));

    if (!response.ok) {
      throw new Error(`Mirror Node request failed with HTTP ${response.status}`);
    }

    return response.json();
  }

  private url(path: string): string {
    return new URL(path, `${this.baseUrl.replace(/\/+$/, '')}/`).toString();
  }
}
