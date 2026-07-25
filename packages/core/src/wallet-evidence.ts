export type PoapEvidenceSource = 'poap_compass';

export interface PoapCollectionItem {
  tokenId: string;
  eventId: string;
  collectedAt: string;
  transferCount: number;
  chain?: string;
  eventName?: string;
  eventStartDate?: string;
  imageUrl?: string;
}

export interface PoapCollectionHistory {
  source: PoapEvidenceSource;
  items: PoapCollectionItem[];
  truncated: boolean;
}

export interface PoapCollectionReaderPort {
  listByAddress(address: string): Promise<PoapCollectionHistory>;
}

export interface PoapCollectionSignals {
  totalPoaps: number;
  distinctEvents: number;
  activeYears: number[];
  firstCollectedAt?: string;
  latestCollectedAt?: string;
  tokensWithRecordedTransfers: number;
  totalRecordedTransfers: number;
}

export function summarizePoapCollection(history: PoapCollectionHistory): PoapCollectionSignals {
  const datedItems = history.items
    .filter((item) => !Number.isNaN(Date.parse(item.collectedAt)))
    .toSorted((left, right) => left.collectedAt.localeCompare(right.collectedAt));
  const activeYears = [
    ...new Set(datedItems.map((item) => new Date(item.collectedAt).getUTCFullYear())),
  ].toSorted((left, right) => left - right);
  const firstItem = datedItems[0];
  const latestItem = datedItems.at(-1);

  return {
    totalPoaps: history.items.length,
    distinctEvents: new Set(history.items.map((item) => item.eventId)).size,
    activeYears,
    ...(firstItem ? { firstCollectedAt: firstItem.collectedAt } : {}),
    ...(latestItem ? { latestCollectedAt: latestItem.collectedAt } : {}),
    tokensWithRecordedTransfers: history.items.filter((item) => item.transferCount > 0).length,
    totalRecordedTransfers: history.items.reduce((total, item) => total + item.transferCount, 0),
  };
}
