import { describe, expect, it, vi } from 'vitest';
import type { MqttPublisher, SetCountCommand } from '../services/mqttPublisher.js';
import { createTestApp } from '../test/app.js';
import { FakeMqttPublisher } from '../test/fakes.js';
import { hashScanValue } from './publicRoutes.js';

const hashSecret = 'test-hash-secret';

function createCountingResult(overrides: Record<string, unknown> = {}) {
  return {
    destinationUrl: 'https://instagram.com/spotitap',
    platformDeepLink: 'instagram://user?username=spotitap',
    optimisticApplied: true,
    counterId: 'counter-1',
    deviceId: 'device-1',
    displayedCount: 1284,
    optimisticEventId: 'opt-1',
    ...overrides
  };
}

function createCounting(overrides: Record<string, unknown> = {}) {
  return {
    recordQrScan: vi.fn().mockResolvedValue(createCountingResult(overrides))
  };
}

class RejectingMqttPublisher implements MqttPublisher {
  public readonly publishSetCount = vi.fn<(_command: SetCountCommand) => Promise<void>>().mockRejectedValue(
    new Error('mqtt unavailable')
  );
  public readonly close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

describe('GET /r/:slug', () => {
  it('records a scan, publishes set-count, and redirects to the platform URL', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });

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
      fingerprintHash: hashScanValue(hashSecret, '127.0.0.1:vitest'),
      ipHash: hashScanValue(hashSecret, '127.0.0.1'),
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

  it('redirects and logs when MQTT publish fails after the scan is recorded', async () => {
    const mqtt = new RejectingMqttPublisher();
    const counting = createCounting();
    const app = await createTestApp({ counting, mqtt, hashSecret });
    const warn = vi.spyOn(app.log, 'warn');

    const response = await app.inject({
      method: 'GET',
      url: '/r/cafe-demo',
      headers: {
        'user-agent': 'vitest'
      }
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://instagram.com/spotitap');
    expect(mqtt.publishSetCount).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          slug: 'cafe-demo',
          counterId: 'counter-1',
          deviceId: 'device-1',
          eventId: 'opt-1'
        }),
        'Failed to publish optimistic QR scan count'
      );
    });

    await app.close();
  });

  it('redirects without publishing for non-optimistic scan results', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting({
      optimisticApplied: false,
      deviceId: undefined,
      displayedCount: undefined,
      optimisticEventId: undefined
    });
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'GET',
      url: '/r/cafe-demo',
      headers: {
        'user-agent': 'vitest'
      }
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://instagram.com/spotitap');
    expect(mqtt.setCountCommands).toEqual([]);

    await app.close();
  });

  it('returns route_not_found when counting cannot find the QR route', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = {
      recordQrScan: vi.fn().mockRejectedValue(new Error('QR route not found: cafe-demo'))
    };
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'GET',
      url: '/r/cafe-demo',
      headers: {
        'user-agent': 'vitest'
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'route_not_found' });
    expect(mqtt.setCountCommands).toEqual([]);

    await app.close();
  });

  it('returns a controlled error and does not publish when the destination URL is unsafe', async () => {
    const mqtt = new FakeMqttPublisher();
    const counting = createCounting({
      destinationUrl: 'javascript:alert(1)'
    });
    const app = await createTestApp({ counting, mqtt, hashSecret });

    const response = await app.inject({
      method: 'GET',
      url: '/r/cafe-demo',
      headers: {
        'user-agent': 'vitest'
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'invalid_destination_url' });
    expect(mqtt.setCountCommands).toEqual([]);

    await app.close();
  });
});

describe('hashScanValue', () => {
  it('creates deterministic HMAC hashes without returning raw input', () => {
    const firstHash = hashScanValue(hashSecret, '127.0.0.1:vitest');
    const secondHash = hashScanValue(hashSecret, '127.0.0.1:vitest');

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).not.toBe('127.0.0.1:vitest');
  });
});
