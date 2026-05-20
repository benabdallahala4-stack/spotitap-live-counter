import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/app.js';
import { FakeMqttPublisher } from '../test/fakes.js';

describe('GET /r/:slug', () => {
  it('records a scan, publishes set-count, and redirects to the platform URL', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = {
      recordQrScan: vi.fn().mockResolvedValue({
        destinationUrl: 'https://instagram.com/spotitap',
        platformDeepLink: 'instagram://user?username=spotitap',
        optimisticApplied: true,
        counterId: 'counter-1',
        deviceId: 'device-1',
        displayedCount: 1284,
        optimisticEventId: 'opt-1'
      })
    };
    const app = await createTestApp({ counting, mqtt });

    const response = await app.inject({
      method: 'GET',
      url: '/r/cafe-demo',
      headers: {
        'user-agent': 'vitest',
        'x-forwarded-for': '203.0.113.10'
      }
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://instagram.com/spotitap');
    expect(counting.recordQrScan).toHaveBeenCalledWith({
      slug: 'cafe-demo',
      fingerprintHash: expect.any(String),
      ipHash: expect.any(String),
      userAgent: 'vitest'
    });
    expect(mqtt.setCountCommands).toEqual([
      {
        deviceId: 'device-1',
        counterId: 'counter-1',
        target: 1284,
        reason: 'optimistic_scan',
        eventId: 'opt-1',
        sentAt: expect.any(Date)
      }
    ]);

    await app.close();
  });
});
