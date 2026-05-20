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
    })
  };
}

describe('POST /admin/counters/:counterId/test-count', () => {
  it('publishes an admin test set-count command for the counter device', async () => {
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
});
