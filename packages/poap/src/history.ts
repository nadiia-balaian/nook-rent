import type {
  PoapCollectionHistory,
  PoapCollectionItem,
  PoapCollectionReaderPort,
} from '@nook-rent/core';

const DEFAULT_COMPASS_URL = 'https://public.compass.poap.tech/v1/graphql';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ITEMS = 5_000;

const collectionQuery = /* GraphQL */ `
  query PoapCollection($limit: Int!, $offset: Int!, $where: poaps_bool_exp) {
    poaps(limit: $limit, offset: $offset, order_by: { minted_on: desc }, where: $where) {
      chain
      drop_id
      id
      minted_on
      transfer_count
      drop {
        image_url
        start_date
        name
      }
    }
  }
`;

interface GraphqlEnvelope<Data> {
  data?: Data;
  errors?: Array<{ message?: string }>;
}

interface CompassPoap {
  chain: string;
  drop_id: number | string;
  id: number | string;
  minted_on: number | string;
  transfer_count: number | string;
  drop: {
    image_url: string;
    start_date: string;
    name: string;
  };
}

interface CompassResponse {
  poaps: CompassPoap[];
}

export class PoapHistoryProviderError extends Error {
  constructor() {
    super('POAP collection provider is unavailable');
    this.name = 'PoapHistoryProviderError';
  }
}

export interface PoapCompassHistoryReaderConfig {
  endpoint?: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  maxItems?: number;
  pageSize?: number;
}

function isoFromEpochSeconds(value: number | string): string {
  const milliseconds = Number(value) * 1_000;

  if (!Number.isFinite(milliseconds)) {
    throw new PoapHistoryProviderError();
  }

  return new Date(milliseconds).toISOString();
}

function nonNegativeInteger(value: number | string): number {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new PoapHistoryProviderError();
  }

  return number;
}

function smallArtworkUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.set('size', 'small');
    return url.toString();
  } catch {
    return value;
  }
}

export class PoapCompassHistoryReader implements PoapCollectionReaderPort {
  readonly #config: Required<
    Pick<PoapCompassHistoryReaderConfig, 'endpoint' | 'fetcher' | 'maxItems' | 'pageSize'>
  > & {
    apiKey?: string;
  };

  constructor(config: PoapCompassHistoryReaderConfig = {}) {
    this.#config = {
      endpoint: config.endpoint ?? DEFAULT_COMPASS_URL,
      fetcher: config.fetcher ?? fetch,
      maxItems: config.maxItems ?? DEFAULT_MAX_ITEMS,
      pageSize: config.pageSize ?? DEFAULT_PAGE_SIZE,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    };
  }

  async listByAddress(address: string): Promise<PoapCollectionHistory> {
    const items: PoapCollectionItem[] = [];

    while (items.length <= this.#config.maxItems) {
      const limit = Math.min(this.#config.pageSize, this.#config.maxItems + 1 - items.length);
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
      };

      if (this.#config.apiKey) {
        headers['x-api-key'] = this.#config.apiKey;
      }

      let response: Response;

      try {
        response = await this.#config.fetcher(this.#config.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: collectionQuery,
            variables: {
              limit,
              offset: items.length,
              where: {
                collector_address: {
                  _eq: address.toLowerCase(),
                },
              },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new PoapHistoryProviderError();
      }

      if (!response.ok) {
        throw new PoapHistoryProviderError();
      }

      let body: GraphqlEnvelope<CompassResponse>;

      try {
        body = (await response.json()) as GraphqlEnvelope<CompassResponse>;
      } catch {
        throw new PoapHistoryProviderError();
      }

      if (body.errors?.length || !body.data) {
        throw new PoapHistoryProviderError();
      }

      items.push(
        ...body.data.poaps.map((poap): PoapCollectionItem => ({
          tokenId: String(poap.id),
          eventId: String(poap.drop_id),
          collectedAt: isoFromEpochSeconds(poap.minted_on),
          transferCount: nonNegativeInteger(poap.transfer_count),
          chain: poap.chain,
          eventName: poap.drop.name,
          eventStartDate: poap.drop.start_date,
          imageUrl: smallArtworkUrl(poap.drop.image_url),
        })),
      );

      if (body.data.poaps.length < limit) {
        break;
      }
    }

    return {
      source: 'poap_compass',
      items: items.slice(0, this.#config.maxItems),
      truncated: items.length > this.#config.maxItems,
    };
  }
}
