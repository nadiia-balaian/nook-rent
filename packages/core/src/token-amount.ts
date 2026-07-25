import { DomainValidationError } from './errors.js';

export type RoundingMode = 'floor' | 'ceil';

function parseAtomicUnits(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new DomainValidationError('token amount numbers must be safe integers');
    }

    return BigInt(value);
  }

  if (!/^\d+$/.test(value)) {
    throw new DomainValidationError('token amount strings must contain atomic units only');
  }

  return BigInt(value);
}

export class TokenAmount {
  static zero(): TokenAmount {
    return new TokenAmount(0n);
  }

  static fromAtomicUnits(value: bigint | number | string): TokenAmount {
    const atomicUnits = parseAtomicUnits(value);

    if (atomicUnits < 0n) {
      throw new DomainValidationError('token amount cannot be negative');
    }

    return new TokenAmount(atomicUnits);
  }

  private constructor(readonly atomicUnits: bigint) {}

  add(other: TokenAmount): TokenAmount {
    return TokenAmount.fromAtomicUnits(this.atomicUnits + other.atomicUnits);
  }

  subtract(other: TokenAmount): TokenAmount {
    if (other.atomicUnits > this.atomicUnits) {
      throw new DomainValidationError('token amount cannot become negative');
    }

    return TokenAmount.fromAtomicUnits(this.atomicUnits - other.atomicUnits);
  }

  multiplyInteger(multiplier: number): TokenAmount {
    if (!Number.isSafeInteger(multiplier) || multiplier < 0) {
      throw new DomainValidationError('token amount multiplier must be a non-negative integer');
    }

    return TokenAmount.fromAtomicUnits(this.atomicUnits * BigInt(multiplier));
  }

  multiplyRatio(
    numerator: bigint,
    denominator: bigint,
    rounding: RoundingMode = 'floor',
  ): TokenAmount {
    if (numerator < 0n || denominator <= 0n) {
      throw new DomainValidationError(
        'token amount ratio requires a non-negative numerator and positive denominator',
      );
    }

    const product = this.atomicUnits * numerator;
    const quotient = product / denominator;
    const remainder = product % denominator;
    const rounded = rounding === 'ceil' && remainder !== 0n ? quotient + 1n : quotient;

    return TokenAmount.fromAtomicUnits(rounded);
  }

  equals(other: TokenAmount): boolean {
    return this.atomicUnits === other.atomicUnits;
  }

  isZero(): boolean {
    return this.atomicUnits === 0n;
  }

  toJSON(): string {
    return this.toString();
  }

  toString(): string {
    return this.atomicUnits.toString();
  }
}
