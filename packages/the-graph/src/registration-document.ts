import { z } from 'zod';

import { DEFAULT_AGENT_CAPABILITY } from './environment.js';

const registrationServiceSchema = z.object({
  name: z.string().trim().min(1),
  endpoint: z.url(),
  version: z.string().trim().min(1).optional(),
  capabilities: z.array(z.string().trim().min(1)).default([]),
});

const registrationDocumentSchema = z.object({
  type: z.literal('https://eips.ethereum.org/EIPS/eip-8004#registration-v1'),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  services: z.array(registrationServiceSchema).min(1),
  active: z.literal(true),
});

export interface Agent0RegistrationDocument {
  name: string;
  requiredCapability: string;
  serviceEndpoint: string;
}

function normalizedPrefix(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateAgent0RegistrationDocument(
  value: unknown,
  requiredCapability = DEFAULT_AGENT_CAPABILITY,
): Agent0RegistrationDocument {
  const document = registrationDocumentSchema.parse(value);
  const matchingService = document.services.find((service) => {
    const prefix = normalizedPrefix(service.name);
    return service.capabilities.some(
      (capability) => `${prefix}:${capability.trim().toLowerCase()}` === requiredCapability,
    );
  });

  if (!matchingService) {
    throw new Error(`Registration document must advertise ${requiredCapability}`);
  }

  return {
    name: document.name,
    requiredCapability,
    serviceEndpoint: matchingService.endpoint,
  };
}
