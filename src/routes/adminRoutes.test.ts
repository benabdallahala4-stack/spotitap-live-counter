import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/app.js';
import { FakeMqttPublisher } from '../test/fakes.js';

const hashSecret = 'test-hash-secret';

function createCounting() {
  return {
    recordQrScan: vi.fn(),
    getCounterDeviceTarget: vi.fn().mockResolvedValue({
      counterId: 'counter-1',
      deviceId: 'device-1',
      displayedCount: 1300
    }),
    configureCounterSocialTarget: vi.fn().mockResolvedValue({
      counterId: 'counter-1',
      destinationUrl: 'https://instagram.com/spotitap',
      platformDeepLink: 'instagram://user?username=spotitap'
    }),
    setVerifiedCount: vi.fn().mockResolvedValue({
      counterId: 'counter-1',
      deviceId: 'device-1',
      displayedCount: 1500,
      optimisticDelta: 0
    }),
    listPrototypeTargets: vi.fn().mockResolvedValue([
      {
        counterId: 'counter-1',
        label: 'Pilot Instagram Counter',
        platform: 'instagram',
        status: 'active',
        verifiedCount: 1283,
        optimisticDelta: 0,
        displayedCount: 1283,
        deviceId: 'device-1',
        deviceSerial: 'SP-LIVE-DEV-0001',
        deviceStatus: 'claimed'
      }
    ])
  };
}

describe('GET /admin/prototype-targets', () => {
  it('lists prototype counters and devices for the console', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/prototype-targets',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      targets: [
        {
          counterId: 'counter-1',
          label: 'Pilot Instagram Counter',
          platform: 'instagram',
          status: 'active',
          verifiedCount: 1283,
          optimisticDelta: 0,
          displayedCount: 1283,
          deviceId: 'device-1',
          deviceSerial: 'SP-LIVE-DEV-0001',
          deviceStatus: 'claimed'
        }
      ]
    });
    expect(counting.listPrototypeTargets).toHaveBeenCalledOnce();

    await app.close();
  });

  it('rejects prototype target listing without the admin token', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/prototype-targets'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(counting.listPrototypeTargets).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /admin/counters/:counterId/test-count', () => {
  it('publishes an admin test set-count command for the counter device', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/test-count',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        target: 1300
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sent: true,
      deviceId: 'device-1',
      target: 1300
    });
    expect(counting.getCounterDeviceTarget).toHaveBeenCalledWith('counter-1');
    expect(mqtt.setCountCommands).toEqual([
      {
        deviceId: 'device-1',
        counterId: 'counter-1',
        target: 1300,
        reason: 'admin_test',
        eventId: 'admin-test',
        sentAt: expect.any(Date)
      }
    ]);

    await app.close();
  });

  it('rejects admin test-count requests without the admin token', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/test-count',
      payload: {
        target: 1300
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(counting.getCounterDeviceTarget).not.toHaveBeenCalled();
    expect(mqtt.setCountCommands).toEqual([]);

    await app.close();
  });
});

describe('POST /admin/counters/:counterId/verified-count', () => {
  it('reconciles a verified count and publishes the corrected device count', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/verified-count',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        verifiedCount: 1500,
        source: 'manual_admin'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reconciled: true,
      counterId: 'counter-1',
      deviceId: 'device-1',
      displayedCount: 1500
    });
    expect(counting.setVerifiedCount).toHaveBeenCalledWith({
      counterId: 'counter-1',
      verifiedCount: 1500,
      source: 'manual_admin',
      rawPayload: {
        verifiedCount: 1500,
        source: 'manual_admin'
      }
    });
    expect(mqtt.setCountCommands).toEqual([
      {
        deviceId: 'device-1',
        counterId: 'counter-1',
        target: 1500,
        reason: 'verified_count',
        eventId: 'verified-count',
        sentAt: expect.any(Date)
      }
    ]);

    await app.close();
  });

  it('rejects verified count reconciliation without the admin token', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/verified-count',
      payload: {
        verifiedCount: 1500,
        source: 'manual_admin'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(counting.setVerifiedCount).not.toHaveBeenCalled();
    expect(mqtt.setCountCommands).toEqual([]);

    await app.close();
  });

  it('rejects invalid verified counts', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/verified-count',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        verifiedCount: -1,
        source: 'manual_admin'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_verified_count' });
    expect(counting.setVerifiedCount).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns counter_not_found when no counter can be reconciled', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    counting.setVerifiedCount.mockResolvedValue(null);
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/missing-counter/verified-count',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        verifiedCount: 1500,
        source: 'manual_admin'
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'counter_not_found' });
    expect(mqtt.setCountCommands).toEqual([]);

    await app.close();
  });
});

describe('POST /admin/counters/:counterId/social-target', () => {
  it('configures a counter social target and activates its QR route', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/social-target',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        destinationUrl: 'https://instagram.com/spotitap',
        platformDeepLink: 'instagram://user?username=spotitap'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: true,
      counterId: 'counter-1',
      destinationUrl: 'https://instagram.com/spotitap',
      platformDeepLink: 'instagram://user?username=spotitap'
    });
    expect(counting.configureCounterSocialTarget).toHaveBeenCalledWith({
      counterId: 'counter-1',
      destinationUrl: 'https://instagram.com/spotitap',
      platformDeepLink: 'instagram://user?username=spotitap'
    });

    await app.close();
  });

  it('rejects social target requests without the admin token', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/social-target',
      payload: {
        destinationUrl: 'https://instagram.com/spotitap',
        platformDeepLink: 'instagram://user?username=spotitap'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(counting.configureCounterSocialTarget).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects unsafe destination URL protocols', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/counter-1/social-target',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        destinationUrl: 'javascript:alert(1)',
        platformDeepLink: 'instagram://user?username=spotitap'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_destination_url' });
    expect(counting.configureCounterSocialTarget).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns counter_not_found when the counter or QR route is missing', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    counting.configureCounterSocialTarget.mockResolvedValue(null);
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/counters/missing-counter/social-target',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        destinationUrl: 'https://instagram.com/spotitap',
        platformDeepLink: 'instagram://user?username=spotitap'
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'counter_not_found' });

    await app.close();
  });
});
