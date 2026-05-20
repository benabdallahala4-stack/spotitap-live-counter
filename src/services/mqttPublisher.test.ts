import { describe, expect, it } from 'vitest';
import { buildSetCountMessage } from './mqttPublisher.js';

describe('buildSetCountMessage', () => {
  it('builds the device topic and JSON payload', () => {
    const message = buildSetCountMessage({
      deviceId: 'device-1',
      counterId: 'counter-1',
      target: 1284,
      reason: 'optimistic_scan',
      eventId: 'opt-1',
      sentAt: new Date('2026-05-20T12:00:00.000Z')
    });

    expect(message.topic).toBe('devices/device-1/commands/set-count');
    expect(JSON.parse(message.payload)).toEqual({
      counterId: 'counter-1',
      target: 1284,
      reason: 'optimistic_scan',
      eventId: 'opt-1',
      sentAt: '2026-05-20T12:00:00.000Z'
    });
  });
});
