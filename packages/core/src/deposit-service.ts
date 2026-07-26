import type { Booking, ExternalOperation } from './entities.js';
import { DomainConflictError, DomainValidationError, ResourceNotFoundError } from './errors.js';
import type {
  AgentPaymentMandateRepositoryPort,
  BookingRepositoryPort,
  ClockPort,
  DepositOperationRepositoryPort,
  DepositOperationSnapshot,
  FinancialLedgerPort,
  IdGeneratorPort,
  RentalEvidencePort,
} from './ports.js';
import { requireUsableAgentPaymentMandate } from './agent-payment-mandate-service.js';

const RETRY_DELAY_MILLISECONDS = 5_000;

export type DepositEvidence =
  | { status: 'not_started' }
  | { status: 'pending'; transactionId: string }
  | {
      status: 'confirmed';
      transactionId: string;
      sequenceNumber: number;
    };

export interface DepositWorkflowResult {
  snapshot: DepositOperationSnapshot;
  evidence: DepositEvidence;
  idempotent: boolean;
}

export interface BookingDepositServiceDependencies {
  bookings: BookingRepositoryPort;
  operations: DepositOperationRepositoryPort;
  ledger: FinancialLedgerPort;
  evidence: RentalEvidencePort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  escrowRecipientRef: string;
  paymentMandates?: AgentPaymentMandateRepositoryPort;
}

function requireIdempotencyKey(value: string): string {
  const normalized = value.trim();

  if (normalized.length < 8 || normalized.length > 200) {
    throw new DomainValidationError('idempotencyKey must be between 8 and 200 characters');
  }

  return normalized;
}

function requireEscrowRecipient(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new DomainValidationError('escrowRecipientRef is required');
  }

  return normalized;
}

function addRetryDelay(timestamp: string): string {
  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    throw new DomainValidationError('clock returned an invalid timestamp');
  }

  return new Date(parsed + RETRY_DELAY_MILLISECONDS).toISOString();
}

function operationResponse(operation: ExternalOperation) {
  return operation.providerResponse ?? {};
}

function evidenceFromOperation(operation: ExternalOperation): DepositEvidence {
  const response = operationResponse(operation);
  const transactionId = response.evidenceTransactionId;
  const sequenceNumber = response.evidenceSequenceNumber;

  if (typeof transactionId !== 'string') {
    return { status: 'not_started' };
  }

  return typeof sequenceNumber === 'number'
    ? { status: 'confirmed', transactionId, sequenceNumber }
    : { status: 'pending', transactionId };
}

export class BookingDepositService {
  private readonly escrowRecipientRef: string;

  constructor(private readonly dependencies: BookingDepositServiceDependencies) {
    this.escrowRecipientRef = requireEscrowRecipient(dependencies.escrowRecipientRef);
  }

  async fundDeposit(input: {
    bookingId: string;
    idempotencyKey: string;
    agentPaymentMandateId?: string;
  }): Promise<DepositWorkflowResult> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const booking = await this.dependencies.bookings.getById(input.bookingId);

    if (!booking) {
      throw new ResourceNotFoundError('Booking', input.bookingId);
    }

    this.requireFundableBooking(booking);

    if (input.agentPaymentMandateId) {
      const mandates = this.dependencies.paymentMandates;

      if (!mandates) {
        throw new DomainConflictError(
          'agent_payment_mandates_unavailable',
          'Agent Payment Mandates are not configured',
        );
      }

      const mandate = await mandates.getById(input.agentPaymentMandateId);

      if (!mandate) {
        throw new ResourceNotFoundError('Agent Payment Mandate', input.agentPaymentMandateId);
      }

      requireUsableAgentPaymentMandate({
        mandate,
        booking,
        now: this.dependencies.clock.now(),
      });
    }

    const operationId = this.dependencies.ids.next('operation');
    const snapshot = await this.dependencies.operations.prepare({
      operationId,
      escrowId: this.dependencies.ids.next('escrow'),
      paymentId: this.dependencies.ids.next('payment'),
      idempotencyKey,
      booking,
      escrowRecipientRef: this.escrowRecipientRef,
      publicEvidenceRef: this.dependencies.ids.next('evidence'),
      ...(input.agentPaymentMandateId
        ? { agentPaymentMandateId: input.agentPaymentMandateId }
        : {}),
      now: this.dependencies.clock.now(),
    });

    return this.advance(snapshot, snapshot.operation.id !== operationId);
  }

  async reconcileDeposit(operationId: string): Promise<DepositWorkflowResult> {
    const snapshot = await this.dependencies.operations.getById(operationId);

    if (!snapshot) {
      throw new ResourceNotFoundError('Operation', operationId);
    }

    return this.advance(snapshot, true);
  }

  async getDeposit(operationId: string): Promise<DepositWorkflowResult> {
    const snapshot = await this.dependencies.operations.getById(operationId);

    if (!snapshot) {
      throw new ResourceNotFoundError('Operation', operationId);
    }

    return {
      snapshot,
      evidence: evidenceFromOperation(snapshot.operation),
      idempotent: true,
    };
  }

  private requireFundableBooking(booking: Booking): void {
    if (booking.status !== 'awaiting_deposit' && booking.status !== 'confirmed') {
      throw new DomainConflictError(
        'booking_not_awaiting_deposit',
        `Booking cannot accept a deposit from ${booking.status}`,
      );
    }
  }

  private async advance(
    initialSnapshot: DepositOperationSnapshot,
    idempotent: boolean,
  ): Promise<DepositWorkflowResult> {
    let snapshot = initialSnapshot;

    if (snapshot.operation.status === 'failed') {
      return {
        snapshot,
        evidence: evidenceFromOperation(snapshot.operation),
        idempotent,
      };
    }

    if (snapshot.operation.status === 'pending') {
      const transactionId = await this.dependencies.ledger.reserveTransactionId(
        snapshot.operation.id,
      );
      snapshot = await this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        providerTransactionId: transactionId,
        status: 'reserved',
        updatedAt: this.dependencies.clock.now(),
      });
    }

    if (snapshot.operation.status === 'reserved') {
      snapshot = await this.submitDeposit(snapshot);
    }

    if (snapshot.operation.status === 'submitted' || snapshot.operation.status === 'reconciling') {
      snapshot = await this.reconcileFinancialTransaction(snapshot);
    }

    if (snapshot.operation.status === 'confirmed') {
      snapshot = await this.publishEvidence(snapshot);
    }

    return {
      snapshot,
      evidence: evidenceFromOperation(snapshot.operation),
      idempotent,
    };
  }

  private async submitDeposit(
    snapshot: DepositOperationSnapshot,
  ): Promise<DepositOperationSnapshot> {
    const transactionId = snapshot.operation.providerTransactionId;

    if (!transactionId) {
      throw new DomainConflictError(
        'operation_transaction_missing',
        'Deposit Operation has no reserved transaction ID',
      );
    }

    try {
      const submission = await this.dependencies.ledger.submitDeposit({
        operationId: snapshot.operation.id,
        submissionTransactionId: transactionId,
        bookingId: snapshot.booking.id,
        tokenId: snapshot.booking.settlementTokenId,
        amount: snapshot.booking.depositAmount,
      });

      if (submission.transactionId !== transactionId) {
        throw new DomainConflictError(
          'provider_transaction_mismatch',
          'Hedera returned a different transaction ID than the reserved ID',
        );
      }

      return this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        status: 'submitted',
        providerResponse: {
          ...operationResponse(snapshot.operation),
          submissionAccepted: true,
        },
        attemptCount: snapshot.operation.attemptCount + 1,
        updatedAt: this.dependencies.clock.now(),
      });
    } catch (error) {
      if (error instanceof DomainConflictError) {
        throw error;
      }

      const now = this.dependencies.clock.now();
      return this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        status: 'reconciling',
        providerResponse: {
          ...operationResponse(snapshot.operation),
          submissionOutcome: 'unknown',
        },
        failureCode: 'submission_outcome_unknown',
        attemptCount: snapshot.operation.attemptCount + 1,
        nextAttemptAt: addRetryDelay(now),
        updatedAt: now,
      });
    }
  }

  private async reconcileFinancialTransaction(
    snapshot: DepositOperationSnapshot,
  ): Promise<DepositOperationSnapshot> {
    const transactionId = snapshot.operation.providerTransactionId;

    if (!transactionId) {
      throw new DomainConflictError(
        'operation_transaction_missing',
        'Deposit Operation has no transaction ID to reconcile',
      );
    }

    const status = await this.dependencies.ledger.getTransactionStatus(transactionId);

    if (status === 'pending' || status === 'unknown') {
      const now = this.dependencies.clock.now();
      return this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        status: 'reconciling',
        providerResponse: {
          ...operationResponse(snapshot.operation),
          mirrorStatus: status,
        },
        nextAttemptAt: addRetryDelay(now),
        updatedAt: now,
      });
    }

    if (status === 'failed') {
      return this.dependencies.operations.failDeposit({
        operationId: snapshot.operation.id,
        failureCode: 'hedera_transaction_failed',
        providerResponse: {
          ...operationResponse(snapshot.operation),
          mirrorStatus: status,
        },
        now: this.dependencies.clock.now(),
      });
    }

    return this.dependencies.operations.confirmDeposit({
      operationId: snapshot.operation.id,
      transactionId,
      providerResponse: {
        ...operationResponse(snapshot.operation),
        mirrorStatus: status,
      },
      now: this.dependencies.clock.now(),
    });
  }

  private async publishEvidence(
    snapshot: DepositOperationSnapshot,
  ): Promise<DepositOperationSnapshot> {
    const response = operationResponse(snapshot.operation);

    if (typeof response.evidenceSequenceNumber === 'number') {
      return snapshot;
    }

    let evidenceTransactionId =
      typeof response.evidenceTransactionId === 'string'
        ? response.evidenceTransactionId
        : undefined;

    if (!evidenceTransactionId) {
      evidenceTransactionId = await this.dependencies.evidence.reserveTransactionId(
        `${snapshot.operation.id}:evidence`,
      );
      snapshot = await this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        providerResponse: {
          ...response,
          evidenceTransactionId,
          evidenceStatus: 'reserved',
        },
        updatedAt: this.dependencies.clock.now(),
      });
    }

    const publicEvidenceRef = snapshot.operation.requestPayload.publicEvidenceRef;
    const depositTransactionId = snapshot.operation.providerTransactionId;

    if (typeof publicEvidenceRef !== 'string' || !depositTransactionId) {
      throw new DomainConflictError(
        'evidence_context_missing',
        'Deposit Operation is missing its public evidence context',
      );
    }

    try {
      const publication = await this.dependencies.evidence.publish({
        operationId: snapshot.operation.id,
        submissionTransactionId: evidenceTransactionId,
        eventId: `deposit-funded:${publicEvidenceRef}`,
        eventType: 'booking.deposit.funded',
        occurredAt: this.dependencies.clock.now(),
        subjectRef: publicEvidenceRef,
        payload: {
          amountAtomic: snapshot.booking.depositAmount.toString(),
          depositTransactionId,
          network: 'hedera-testnet',
          state: 'funded',
          tokenId: snapshot.booking.settlementTokenId,
        },
      });

      return this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        providerResponse: {
          ...operationResponse(snapshot.operation),
          evidenceStatus: 'confirmed',
          evidenceTransactionId: publication.transactionId,
          evidenceSequenceNumber: publication.sequenceNumber,
        },
        updatedAt: this.dependencies.clock.now(),
      });
    } catch {
      return this.dependencies.operations.saveOperation({
        ...snapshot.operation,
        providerResponse: {
          ...operationResponse(snapshot.operation),
          evidenceStatus: 'pending',
          evidenceTransactionId,
        },
        updatedAt: this.dependencies.clock.now(),
      });
    }
  }
}
