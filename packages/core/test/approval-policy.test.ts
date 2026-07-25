import { describe, expect, it } from 'vitest';

import { evaluateApprovalPolicy, evaluateBookingEligibility } from '../src/index.js';

const eligibleInput = {
  listingAvailable: true,
  humanBackedAgent: true,
  registeredAgent: true,
  hasBookingCapability: true,
  houseRulesAccepted: true,
  requestedGuests: 1,
  maxGuests: 2,
  quoteExpiresAt: '2026-07-25T11:00:00.000Z',
  now: '2026-07-25T10:00:00.000Z',
} as const;

describe('evaluateBookingEligibility', () => {
  it('keeps human authorization and Agent registration as hard requirements', () => {
    expect(evaluateBookingEligibility(eligibleInput)).toEqual({ status: 'eligible' });

    expect(
      evaluateBookingEligibility({
        ...eligibleInput,
        humanBackedAgent: false,
        registeredAgent: false,
      }),
    ).toEqual({
      status: 'denied',
      reasons: ['human_backed_agent_required', 'registered_agent_required'],
    });
  });
});

describe('evaluateApprovalPolicy', () => {
  it('automatically approves a qualifying Rental Reputation tier', () => {
    expect(
      evaluateApprovalPolicy({
        policy: {
          automaticApprovalEnabled: true,
          minimumRentalReputationTier: 'silver',
        },
        guestReputationTier: 'gold',
      }),
    ).toEqual({ status: 'auto_approved' });
  });

  it('sends a Newcomer to Host review instead of rejecting them', () => {
    expect(
      evaluateApprovalPolicy({
        policy: {
          automaticApprovalEnabled: true,
          minimumRentalReputationTier: 'silver',
        },
        guestReputationTier: 'newcomer',
      }),
    ).toEqual({
      status: 'host_review',
      reason: 'rental_reputation_below_minimum',
    });
  });
});
