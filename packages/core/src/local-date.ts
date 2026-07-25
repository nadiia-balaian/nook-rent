import { DomainValidationError } from './errors.js';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

function parseLocalDate(value: string): { epochDay: number; iso: string } {
  const match = LOCAL_DATE_PATTERN.exec(value);

  if (!match) {
    throw new DomainValidationError('local date must use YYYY-MM-DD format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new DomainValidationError(`invalid local date: ${value}`);
  }

  return {
    epochDay: timestamp / MILLISECONDS_PER_DAY,
    iso: value,
  };
}

export class LocalDate {
  static parse(value: string): LocalDate {
    const parsed = parseLocalDate(value);
    return new LocalDate(parsed.iso, parsed.epochDay);
  }

  private constructor(
    readonly iso: string,
    readonly epochDay: number,
  ) {}

  compare(other: LocalDate): number {
    return this.epochDay - other.epochDay;
  }

  daysUntil(other: LocalDate): number {
    return other.epochDay - this.epochDay;
  }

  equals(other: LocalDate): boolean {
    return this.epochDay === other.epochDay;
  }

  toJSON(): string {
    return this.iso;
  }

  toString(): string {
    return this.iso;
  }
}

export const MIN_STAY_NIGHTS = 3;
export const MAX_STAY_NIGHTS = 90;

export class StayRange {
  static create(input: { checkIn: LocalDate; checkOut: LocalDate }): StayRange {
    const nights = input.checkIn.daysUntil(input.checkOut);

    if (nights < MIN_STAY_NIGHTS) {
      throw new DomainValidationError(`stay must be at least ${MIN_STAY_NIGHTS} nights`);
    }

    if (nights > MAX_STAY_NIGHTS) {
      throw new DomainValidationError(`stay cannot exceed ${MAX_STAY_NIGHTS} nights`);
    }

    return new StayRange(input.checkIn, input.checkOut, nights);
  }

  static fromStrings(input: { checkIn: string; checkOut: string }): StayRange {
    return StayRange.create({
      checkIn: LocalDate.parse(input.checkIn),
      checkOut: LocalDate.parse(input.checkOut),
    });
  }

  private constructor(
    readonly checkIn: LocalDate,
    readonly checkOut: LocalDate,
    readonly nights: number,
  ) {}

  overlaps(other: StayRange): boolean {
    return this.checkIn.compare(other.checkOut) < 0 && other.checkIn.compare(this.checkOut) < 0;
  }

  contains(other: StayRange): boolean {
    return this.checkIn.compare(other.checkIn) <= 0 && this.checkOut.compare(other.checkOut) >= 0;
  }
}
