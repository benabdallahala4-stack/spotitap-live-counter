import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/app.js';
import { FakeMqttPublisher } from '../test/fakes.js';

const hashSecret = 'test-hash-secret';

function createCounting() {
  return {
    recordQrScan: vi.fn(),
    getCounterDeviceTarget: vi.fn(),
    configureCounterSocialTarget: vi.fn(),
    setVerifiedCount: vi.fn(),
    listPrototypeTargets: vi.fn()
  };
}

describe('GET /prototype-console', () => {
  it('serves the prototype console HTML', async () => {
    const app = await createTestApp({
      counting: createCounting(),
      mqtt: new FakeMqttPublisher(),
      hashSecret
    });

    const response = await app.inject({
      method: 'GET',
      url: '/prototype-console'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Spotitap Prototype Console');
    expect(response.body).toContain('/admin/prototype-targets');

    await app.close();
  });
});
