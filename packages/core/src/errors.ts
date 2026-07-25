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

export class ResourceNotFoundError extends Error {
  constructor(
    readonly resource: string,
    readonly resourceId: string,
  ) {
    super(`${resource} not found: ${resourceId}`);
    this.name = 'ResourceNotFoundError';
  }
}

export class DomainConflictError extends Error {
  constructor(
    readonly conflict: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainConflictError';
  }
}

export class HumanBackedAuthorizationError extends Error {
  constructor(
    readonly reason:
      'invalid_agentkit_proof' | 'agent_not_human_backed' | 'authorization_provider_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'HumanBackedAuthorizationError';
  }
}
