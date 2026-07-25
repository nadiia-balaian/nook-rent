import { describe, expect, it } from 'vitest';

import { validateAgent0RegistrationDocument } from '../src/registration-document.js';

const document = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Nook.rent Guest Agent',
  description: 'Requests human-backed reservation holds.',
  services: [
    {
      name: 'Nook.rent',
      endpoint: 'https://api.nook.rent',
      version: '1.0.0',
      capabilities: ['listing-search', 'reservation-hold'],
    },
  ],
  active: true,
};

describe('Agent0 registration document', () => {
  it('accepts the named Nook.rent reservation capability', () => {
    expect(validateAgent0RegistrationDocument(document)).toEqual({
      name: 'Nook.rent Guest Agent',
      requiredCapability: 'nook.rent:reservation-hold',
      serviceEndpoint: 'https://api.nook.rent',
    });
  });

  it('rejects metadata that does not advertise the protected capability', () => {
    expect(() =>
      validateAgent0RegistrationDocument({
        ...document,
        services: [
          {
            name: 'Nook.rent',
            endpoint: 'https://api.nook.rent',
            capabilities: ['listing-search'],
          },
        ],
      }),
    ).toThrow('Registration document must advertise nook.rent:reservation-hold');
  });
});
