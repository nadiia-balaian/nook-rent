import type { AgentPaymentMandate, Booking } from './entities.js';
import { DomainConflictError, DomainValidationError, ResourceNotFoundError } from './errors.js';
import type {
  AgentPaymentMandateRepositoryPort,
  BookingRepositoryPort,
  ClockPort,
  IdGeneratorPort,
  ReservationHoldRepositoryPort,
} from './ports.js';
import type { TokenAmount } from './token-amount.js';

export interface AgentPaymentMandateServiceDependencies {
  bookings: BookingRepositoryPort;
  holds: ReservationHoldRepositoryPort;
  mandates: AgentPaymentMandateRepositoryPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

function requireIdempotencyKey(value: string): string {
  const normalized = value.trim();

  if (normalized.length < 8 || normalized.length > 200) {
    throw new DomainValidationError('idempotencyKey must be between 8 and 200 characters');
  }

  return normalized;
}

function requireAgentAddress(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.length < 3 || normalized.length > 160) {
    throw new DomainValidationError('agentAddress must be between 3 and 160 characters');
  }

  return normalized;
}

function isMandateRetry(
  mandate: AgentPaymentMandate,
  input: {
    idempotencyKey: string;
    agentAddress: string;
    maximumDeposit: TokenAmount;
  },
): boolean {
  return (
    mandate.idempotencyKey === input.idempotencyKey &&
    mandate.agentAddress === input.agentAddress &&
    mandate.maximumDeposit.equals(input.maximumDeposit)
  );
}

export class AgentPaymentMandateService {
  constructor(private readonly dependencies: AgentPaymentMandateServiceDependencies) {}

  async authorize(input: {
    idempotencyKey: string;
    bookingId: string;
    agentAddress: string;
    maximumDeposit: TokenAmount;
  }): Promise<{ status: 'created' | 'idempotent'; mandate: AgentPaymentMandate }> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const agentAddress = requireAgentAddress(input.agentAddress);
    const existing = await this.dependencies.mandates.getByBookingId(input.bookingId);

    if (existing) {
      if (
        !isMandateRetry(existing, {
          idempotencyKey,
          agentAddress,
          maximumDeposit: input.maximumDeposit,
        })
      ) {
        throw new DomainConflictError(
          'agent_payment_mandate_already_exists',
          'This Booking already has a different Agent Payment Mandate',
        );
      }

      return { status: 'idempotent', mandate: existing };
    }

    const booking = await this.dependencies.bookings.getById(input.bookingId);

    if (!booking) {
      throw new ResourceNotFoundError('Booking', input.bookingId);
    }

    const hold = await this.dependencies.holds.getById(booking.holdId);

    if (!hold) {
      throw new ResourceNotFoundError('Reservation Hold', booking.holdId);
    }

    const now = this.dependencies.clock.now();

    if (booking.status !== 'approval_pending' && booking.status !== 'awaiting_deposit') {
      throw new DomainConflictError(
        'booking_not_mandate_eligible',
        `Booking cannot receive an Agent Payment Mandate from ${booking.status}`,
      );
    }

    if (hold.status !== 'active' || Date.parse(hold.expiresAt) <= Date.parse(now)) {
      throw new DomainConflictError(
        'reservation_hold_not_active',
        'An active Reservation Hold is required for an Agent Payment Mandate',
      );
    }

    if (
      input.maximumDeposit.isZero() ||
      input.maximumDeposit.atomicUnits < booking.depositAmount.atomicUnits
    ) {
      throw new DomainConflictError(
        'agent_payment_cap_insufficient',
        'The Agent Payment Mandate cap is below the stored Booking deposit',
      );
    }

    const mandate: AgentPaymentMandate = {
      id: this.dependencies.ids.next('agent_payment_mandate'),
      idempotencyKey,
      guestProfileId: booking.guestProfileId,
      agentAddress,
      bookingId: booking.id,
      quoteId: booking.quoteId,
      tokenId: booking.settlementTokenId,
      maximumDeposit: input.maximumDeposit,
      status: 'active',
      expiresAt: hold.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    return this.dependencies.mandates.authorize(mandate);
  }

  async getForBooking(bookingId: string): Promise<AgentPaymentMandate | undefined> {
    return this.dependencies.mandates.getByBookingId(bookingId);
  }
}

export function requireUsableAgentPaymentMandate(input: {
  mandate: AgentPaymentMandate;
  booking: Booking;
  now: string;
}): void {
  const { mandate, booking } = input;

  if (
    mandate.bookingId !== booking.id ||
    mandate.guestProfileId !== booking.guestProfileId ||
    mandate.quoteId !== booking.quoteId ||
    mandate.tokenId !== booking.settlementTokenId
  ) {
    throw new DomainConflictError(
      'agent_payment_mandate_mismatch',
      'The Agent Payment Mandate does not match the stored Booking terms',
    );
  }

  if (mandate.maximumDeposit.atomicUnits < booking.depositAmount.atomicUnits) {
    throw new DomainConflictError(
      'agent_payment_cap_insufficient',
      'The stored Booking deposit exceeds the Agent Payment Mandate cap',
    );
  }

  if (mandate.status === 'cancelled' || mandate.status === 'expired') {
    throw new DomainConflictError(
      'agent_payment_mandate_inactive',
      `The Agent Payment Mandate is ${mandate.status}`,
    );
  }

  if (mandate.status === 'active' && Date.parse(mandate.expiresAt) <= Date.parse(input.now)) {
    throw new DomainConflictError(
      'agent_payment_mandate_expired',
      'The Agent Payment Mandate has expired',
    );
  }
}
