export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`${entity} cannot transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}
