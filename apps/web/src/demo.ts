const CURRENT_MEMBER_ID = '10000000-0000-4000-8000-000000000001';

export const DEMO_PROFILES = {
  host: {
    id: CURRENT_MEMBER_ID,
    name: 'Maria',
    label: 'Demo Member · Host',
  },
  experiencedGuest: {
    id: CURRENT_MEMBER_ID,
    name: 'Maria',
    label: 'Demo Member · Guest',
    reputationLabel: 'Silver · 3 verified stays',
    tier: 'silver',
  },
  newcomerGuest: {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Jo',
    label: 'Newcomer demo',
    reputationLabel: 'Newcomer · no verified stays yet',
    tier: 'newcomer',
  },
} as const;

export type DemoGuestKey = 'experiencedGuest' | 'newcomerGuest';

export const DEFAULT_SEARCH = {
  city: 'Lisbon',
  checkIn: '2026-08-20',
  checkOut: '2026-08-25',
  guests: 1,
  maximumNightlyRateAtomic: '15000',
  amenities: 'wifi',
} as const;

export const DEFAULT_GUEST_QUERY =
  'Find me a stay in Lisbon from 2026-08-20 to 2026-08-25 for 1 guest under 15000 with wifi.';

export const BOOKING_STEPS = [
  { status: 'request_received', label: 'Request received' },
  { status: 'approval_pending', label: 'Host review' },
  { status: 'awaiting_deposit', label: 'Deposit required' },
  { status: 'confirmed', label: 'Booking confirmed' },
  { status: 'checked_in', label: 'Checked in' },
  { status: 'checkout_pending', label: 'Checkout' },
  { status: 'completed', label: 'Stay completed' },
] as const;
