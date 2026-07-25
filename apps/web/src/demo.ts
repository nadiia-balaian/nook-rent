export const DEMO_PROFILES = {
  host: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Maria',
    label: 'Demo Host',
  },
  experiencedGuest: {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Alex',
    label: 'Silver · 3 completed stays',
    tier: 'silver',
  },
  newcomerGuest: {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Jo',
    label: 'Newcomer · Host review',
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

export const BOOKING_STEPS = [
  { status: 'request_received', label: 'Request received' },
  { status: 'approval_pending', label: 'Host review' },
  { status: 'awaiting_deposit', label: 'Deposit required' },
  { status: 'confirmed', label: 'Booking confirmed' },
  { status: 'checked_in', label: 'Checked in' },
  { status: 'checkout_pending', label: 'Checkout' },
  { status: 'completed', label: 'Stay completed' },
] as const;
