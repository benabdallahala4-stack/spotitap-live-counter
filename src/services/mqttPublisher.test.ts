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

  it('rejects unsafe topic segment values', () => {
    const baseCommand = {
      deviceId: 'device-1',
      counterId: 'counter-1',
      target: 1284,
      reason: 'optimistic_scan' as const,
      eventId: 'opt-1',
      sentAt: new Date('2026-05-20T12:00:00.000Z')
    };

    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        deviceId: 'device/1'
      })
    ).toThrow('deviceId must be a non-empty safe topic segment');
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        deviceId: 'device+1'
      })
    ).toThrow('deviceId must be a non-empty safe topic segment');
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        counterId: ''
      })
    ).toThrow('counterId must be a non-empty safe topic segment');
  });

  it('rejects invalid target values', () => {
    const baseCommand = {
      deviceId: 'device-1',
      counterId: 'counter-1',
      target: 1284,
      reason: 'optimistic_scan' as const,
      eventId: 'opt-1',
      sentAt: new Date('2026-05-20T12:00:00.000Z')
    };

    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        target: -1
      })
    ).toThrow('target must be a finite non-negative integer');
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        target: 1.5
      })
    ).toThrow('target must be a finite non-negative integer');
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        target: Number.POSITIVE_INFINITY
      })
    ).toThrow('target must be a finite non-negative integer');
  });
});
