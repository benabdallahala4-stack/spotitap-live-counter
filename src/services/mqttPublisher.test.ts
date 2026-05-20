import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSetCountMessage, createMqttPublisher, type SetCountCommand } from './mqttPublisher.js';

const mqttMocks = vi.hoisted(() => ({
  connect: vi.fn()
}));

vi.mock('mqtt', () => ({
  default: {
    connect: mqttMocks.connect
  }
}));

class MockMqttClient {
  public connected = true;
  public publish = vi.fn();
  public end = vi.fn();
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.set(event, (this.listeners.get(event) ?? new Set()).add(listener));
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const onceListener = (...args: unknown[]) => {
      this.off(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
}

const baseCommand: SetCountCommand = {
  deviceId: 'device-1',
  counterId: 'counter-1',
  target: 1284,
  reason: 'optimistic_scan',
  eventId: 'opt-1',
  sentAt: new Date('2026-05-20T12:00:00.000Z')
};

beforeEach(() => {
  vi.useRealTimers();
  mqttMocks.connect.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

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
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        deviceId: 123 as unknown as string
      })
    ).toThrow('deviceId must be a non-empty safe topic segment');
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        counterId: 123 as unknown as string
      })
    ).toThrow('counterId must be a non-empty safe topic segment');
  });

  it('rejects invalid target values', () => {
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
    expect(() =>
      buildSetCountMessage({
        ...baseCommand,
        target: Number.MAX_SAFE_INTEGER + 1
      })
    ).toThrow('target must be a finite non-negative integer');
  });
});

describe('createMqttPublisher', () => {
  it('rejects when publish callback returns an error', async () => {
    const client = new MockMqttClient();
    const publishError = new Error('publish failed');
    client.publish.mockImplementation((_topic, _payload, _options, callback) => {
      callback(publishError);
      return client;
    });
    mqttMocks.connect.mockReturnValue(client);
    const publisher = createMqttPublisher({ url: 'mqtt://localhost' });

    await expect(publisher.publishSetCount(baseCommand)).rejects.toThrow('publish failed');
  });

  it('rejects when publish callback does not complete before the timeout', async () => {
    vi.useFakeTimers();
    const client = new MockMqttClient();
    client.publish.mockReturnValue(client);
    mqttMocks.connect.mockReturnValue(client);
    const publisher = createMqttPublisher({
      url: 'mqtt://localhost',
      publishTimeoutMs: 10
    });

    const publish = expect(publisher.publishSetCount(baseCommand)).rejects.toThrow(
      'MQTT publish timed out after 10ms'
    );
    await vi.advanceTimersByTimeAsync(10);

    await publish;
  });

  it('forces client cleanup when graceful close times out', async () => {
    vi.useFakeTimers();
    const client = new MockMqttClient();
    client.end.mockReturnValue(client);
    mqttMocks.connect.mockReturnValue(client);
    const publisher = createMqttPublisher({
      url: 'mqtt://localhost',
      closeTimeoutMs: 10
    });

    const close = expect(publisher.close()).rejects.toThrow('MQTT close timed out after 10ms');
    await vi.advanceTimersByTimeAsync(10);

    await close;
    expect(client.end).toHaveBeenCalledWith(false, {}, expect.any(Function));
    expect(client.end).toHaveBeenCalledWith(true);
  });
});
