import type { RentalReputationTier } from './entities.js';

const REPUTATION_RANK: Record<RentalReputationTier, number> = {
  newcomer: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export type EligibilityDenialReason =
  | 'listing_unavailable'
  | 'human_backed_agent_required'
  | 'registered_agent_required'
  | 'booking_capability_required'
  | 'house_rules_not_accepted'
  | 'occupancy_exceeded'
  | 'quote_expired';

export type EligibilityResult =
  { status: 'eligible' } | { status: 'denied'; reasons: EligibilityDenialReason[] };

export function evaluateBookingEligibility(input: {
  listingAvailable: boolean;
  humanBackedAgent: boolean;
  registeredAgent: boolean;
  hasBookingCapability: boolean;
  houseRulesAccepted: boolean;
  requestedGuests: number;
  maxGuests: number;
  quoteExpiresAt: string;
  now: string;
}): EligibilityResult {
  const reasons: EligibilityDenialReason[] = [];

  if (!input.listingAvailable) reasons.push('listing_unavailable');
  if (!input.humanBackedAgent) reasons.push('human_backed_agent_required');
  if (!input.registeredAgent) reasons.push('registered_agent_required');
  if (!input.hasBookingCapability) reasons.push('booking_capability_required');
  if (!input.houseRulesAccepted) reasons.push('house_rules_not_accepted');
  if (input.requestedGuests < 1 || input.requestedGuests > input.maxGuests) {
    reasons.push('occupancy_exceeded');
  }
  if (Date.parse(input.quoteExpiresAt) <= Date.parse(input.now)) reasons.push('quote_expired');

  return reasons.length === 0 ? { status: 'eligible' } : { status: 'denied', reasons };
}

export interface ApprovalPolicy {
  automaticApprovalEnabled: boolean;
  minimumRentalReputationTier: RentalReputationTier;
}

export type ApprovalDecision =
  | { status: 'auto_approved' }
  | {
      status: 'host_review';
      reason: 'automatic_approval_disabled' | 'rental_reputation_below_minimum';
    };

export function evaluateApprovalPolicy(input: {
  policy: ApprovalPolicy;
  guestReputationTier: RentalReputationTier;
}): ApprovalDecision {
  if (!input.policy.automaticApprovalEnabled) {
    return {
      status: 'host_review',
      reason: 'automatic_approval_disabled',
    };
  }

  if (
    REPUTATION_RANK[input.guestReputationTier] <
    REPUTATION_RANK[input.policy.minimumRentalReputationTier]
  ) {
    return {
      status: 'host_review',
      reason: 'rental_reputation_below_minimum',
    };
  }

  return { status: 'auto_approved' };
}
