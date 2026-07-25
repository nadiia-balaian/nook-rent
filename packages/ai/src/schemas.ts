import type {
  GuestSearchInterpretation,
  ListingDraft,
  ListingRecommendation,
} from '@nook-rent/core';
import { z } from 'zod';

export const hostListingDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(1).max(2_000),
    suggestedAmenities: z.array(z.string().trim().min(1).max(80)).max(12),
    inferredFields: z.array(z.enum(['description', 'suggestedAmenities', 'title'])).max(3),
  })
  .strict();

export const guestSearchInterpretationSchema = z
  .object({
    status: z.enum(['needs_clarification', 'ready']),
    question: z.string().trim().max(300).nullable(),
    city: z.string().trim().max(120).nullable(),
    checkIn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    checkOut: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    guests: z.number().int().min(1).max(100).nullable(),
    maximumNightlyRateAtomic: z.string().regex(/^\d+$/).nullable(),
    requiredAmenities: z.array(z.string().trim().min(1).max(80)).max(12),
  })
  .strict();

export const listingRankingSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            listingId: z.string().trim().min(1),
            summary: z.string().trim().min(1).max(300),
            matchReasons: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export function parseHostListingDraft(value: unknown): ListingDraft {
  return hostListingDraftSchema.parse(value);
}

export function parseGuestSearchInterpretation(value: unknown): GuestSearchInterpretation {
  const parsed = guestSearchInterpretationSchema.parse(value);

  if (parsed.status === 'needs_clarification') {
    if (!parsed.question) {
      throw new Error('A clarification question is required');
    }

    return {
      status: 'needs_clarification',
      question: parsed.question,
    };
  }

  if (!parsed.city || !parsed.checkIn || !parsed.checkOut || parsed.guests === null) {
    throw new Error('A ready search interpretation must include all required filters');
  }

  return {
    status: 'ready',
    city: parsed.city,
    checkIn: parsed.checkIn,
    checkOut: parsed.checkOut,
    guests: parsed.guests,
    ...(parsed.maximumNightlyRateAtomic
      ? { maximumNightlyRateAtomic: parsed.maximumNightlyRateAtomic }
      : {}),
    requiredAmenities: parsed.requiredAmenities,
  };
}

export function parseListingRecommendations(value: unknown): ListingRecommendation[] {
  return listingRankingSchema.parse(value).recommendations;
}
