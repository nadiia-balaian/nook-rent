import type { BookingQuote, RentalReputationTier } from './entities.js';
import { DomainValidationError } from './errors.js';
import type { StayRange } from './local-date.js';
import type { TokenAmount } from './token-amount.js';

export interface DepositPolicy {
  multiplierBasisPoints: Record<RentalReputationTier, number>;
}

export const DEFAULT_DEPOSIT_POLICY: DepositPolicy = {
  multiplierBasisPoints: {
    newcomer: 15_000,
    bronze: 12_500,
    silver: 10_000,
    gold: 7_500,
  },
};

function requireTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new DomainValidationError(`${field} must be an ISO timestamp`);
  }
}

export function quoteDeposit(input: {
  baseDeposit: TokenAmount;
  reputationTier: RentalReputationTier;
  policy?: DepositPolicy;
}): TokenAmount {
  const policy = input.policy ?? DEFAULT_DEPOSIT_POLICY;
  const multiplier = policy.multiplierBasisPoints[input.reputationTier];

  if (!Number.isSafeInteger(multiplier) || multiplier < 0) {
    throw new DomainValidationError(
      `deposit multiplier for ${input.reputationTier} must be a non-negative integer`,
    );
  }

  return input.baseDeposit.multiplyRatio(BigInt(multiplier), 10_000n, 'ceil');
}

export function createBookingQuote(input: {
  id: string;
  listingId: string;
  guestProfileId: string;
  stayRange: StayRange;
  nightlyRate: TokenAmount;
  baseDeposit: TokenAmount;
  reputationTier: RentalReputationTier;
  createdAt: string;
  expiresAt: string;
  depositPolicy?: DepositPolicy;
}): BookingQuote {
  requireTimestamp(input.createdAt, 'createdAt');
  requireTimestamp(input.expiresAt, 'expiresAt');

  if (input.id.trim().length === 0 || input.listingId.trim().length === 0) {
    throw new DomainValidationError('quote and listing IDs are required');
  }

  if (input.guestProfileId.trim().length === 0) {
    throw new DomainValidationError('guest profile ID is required');
  }

  if (input.nightlyRate.isZero() || input.baseDeposit.isZero()) {
    throw new DomainValidationError('nightly rate and base deposit must be greater than zero');
  }

  if (Date.parse(input.expiresAt) <= Date.parse(input.createdAt)) {
    throw new DomainValidationError('quote must expire after it is created');
  }

  const staySubtotal = input.nightlyRate.multiplyInteger(input.stayRange.nights);
  const quotedDeposit = quoteDeposit({
    baseDeposit: input.baseDeposit,
    reputationTier: input.reputationTier,
    ...(input.depositPolicy ? { policy: input.depositPolicy } : {}),
  });

  return {
    id: input.id,
    listingId: input.listingId,
    guestProfileId: input.guestProfileId,
    stayRange: input.stayRange,
    nightlyRate: input.nightlyRate,
    staySubtotal,
    baseDeposit: input.baseDeposit,
    quotedDeposit,
    totalDue: staySubtotal.add(quotedDeposit),
    reputationTier: input.reputationTier,
    expiresAt: input.expiresAt,
    createdAt: input.createdAt,
  };
}
