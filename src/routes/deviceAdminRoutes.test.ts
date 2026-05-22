import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/app.js';
import { FakeMqttPublisher } from '../test/fakes.js';
import type { DeviceAdminPort } from './deviceAdminRoutes.js';

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

function createDevices(overrides: Partial<DeviceAdminPort> = {}): DeviceAdminPort {
  return {
    registerDevice: vi.fn().mockResolvedValue({
      id: 'device-1',
      serial: 'SP-LIVE-DEV-0002',
      status: 'manufactured'
    }),
    ...overrides
  };
}

describe('POST /admin/devices', () => {
  it('creates a manufactured device with hashed secrets', async () => {
    const devices = createDevices();
    const app = await createTestApp({
      counting: createCounting(),
      mqtt: new FakeMqttPublisher(),
      hashSecret,
      devices
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/devices',
      headers: {
        authorization: 'Bearer test-admin-token-0123456789'
      },
      payload: {
        serial: 'SP-LIVE-DEV-0002',
        claimCode: 'CLAIM-0002',
        mqttUsername: 'device-dev-0002',
        mqttPassword: 'dev-password'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      created: true,
      device: {
        id: 'device-1',
        serial: 'SP-LIVE-DEV-0002',
        status: 'manufactured'
      }
    });
    expect(devices.registerDevice).toHaveBeenCalledWith({
      serial: 'SP-LIVE-DEV-0002',
      claimCodeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      mqttUsername: 'device-dev-0002',
      mqttPasswordHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(devices.registerDevice).not.toHaveBeenCalledWith(
      expect.objectContaining({
        claimCodeHash: 'CLAIM-0002',
        mqttPasswordHash: 'dev-password'
      })
    );

    await app.close();
  });

  it('rejects device registration without the admin token', async () => {
    const devices = createDevices();
    const app = await createTestApp({
      counting: createCounting(),
      mqtt: new FakeMqttPublisher(),
      hashSecret,
      devices
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/devices',
      payload: {
        serial: 'SP-LIVE-DEV-0002',
        claimCode: 'CLAIM-0002',
        mqttUsername: 'device-dev-0002',
        mqttPassword: 'dev-password'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(devices.registerDevice).not.toHaveBeenCalled();

    await app.close();
  });

  it('treats duplicate serial registration as idempotent', async () => {
    const devices = createDevices();
    const app = await createTestApp({
      counting: createCounting(),
      mqtt: new FakeMqttPublisher(),
      hashSecret,
      devices
    });
    const payload = {
      serial: 'SP-LIVE-DEV-0002',
      claimCode: 'CLAIM-0002',
      mqttUsername: 'device-dev-0002',
      mqttPassword: 'dev-password'
    };

    const first = await app.inject({
      method: 'POST',
      url: '/admin/devices',
      headers: { authorization: 'Bearer test-admin-token-0123456789' },
      payload
    });
    const second = await app.inject({
      method: 'POST',
      url: '/admin/devices',
      headers: { authorization: 'Bearer test-admin-token-0123456789' },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(devices.registerDevice).toHaveBeenCalledTimes(2);

    await app.close();
  });
});
