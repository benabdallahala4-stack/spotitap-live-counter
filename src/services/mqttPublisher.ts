import mqtt from 'mqtt';

const SAFE_TOPIC_SEGMENT = /^[A-Za-z0-9_.-]+$/;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_PUBLISH_TIMEOUT_MS = 5_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;

export type SetCountReason = 'optimistic_scan' | 'admin_test' | 'verified_sync';

export type SetCountCommand = {
  deviceId: string;
  counterId: string;
  target: number;
  reason: SetCountReason;
  eventId: string;
  sentAt: Date;
};

export type MqttMessage = {
  topic: string;
  payload: string;
};

export type MqttPublisher = {
  publishSetCount(command: SetCountCommand): Promise<void>;
  close(): Promise<void>;
};

function assertSafeTopicSegment(name: string, value: string): void {
  if (typeof value !== 'string' || !SAFE_TOPIC_SEGMENT.test(value)) {
    throw new Error(`${name} must be a non-empty safe topic segment`);
  }
}

function assertValidTarget(target: number): void {
  if (!Number.isFinite(target) || !Number.isSafeInteger(target) || target < 0) {
    throw new Error('target must be a finite non-negative integer');
  }
}

export function buildSetCountMessage(command: SetCountCommand): MqttMessage {
  assertSafeTopicSegment('deviceId', command.deviceId);
  assertSafeTopicSegment('counterId', command.counterId);
  assertValidTarget(command.target);

  return {
    topic: `devices/${command.deviceId}/commands/set-count`,
    payload: JSON.stringify({
      counterId: command.counterId,
      target: command.target,
      reason: command.reason,
      eventId: command.eventId,
      sentAt: command.sentAt.toISOString()
    })
  };
}

export function createMqttPublisher(options: {
  url: string;
  username?: string;
  password?: string;
  connectTimeoutMs?: number;
  publishTimeoutMs?: number;
  closeTimeoutMs?: number;
  reconnectPeriodMs?: number;
}): MqttPublisher {
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const publishTimeoutMs = options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;
  const closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const client = mqtt.connect(options.url, {
    username: options.username || undefined,
    password: options.password || undefined,
    connectTimeout: connectTimeoutMs,
    queueQoSZero: false,
    reconnectPeriod: options.reconnectPeriodMs ?? 0
  });
  let lastError: Error | undefined;

  client.on('error', (error) => {
    lastError = error;
  });

  async function waitForConnect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        settle(
          new Error(
            `MQTT client did not connect within ${connectTimeoutMs}ms${
              lastError ? `: ${lastError.message}` : ''
            }`
          )
        );
      }, connectTimeoutMs);
      const settle = (error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        client.off('connect', onConnect);
        client.off('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onConnect = () => settle();
      const onError = (error: Error) => settle(error);

      client.once('connect', onConnect);
      client.once('error', onError);
      if (client.connected) {
        settle();
      }
    });
  }

  return {
    async publishSetCount(command) {
      const message = buildSetCountMessage(command);
      await waitForConnect();
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          settle(new Error(`MQTT publish timed out after ${publishTimeoutMs}ms`));
        }, publishTimeoutMs);
        const settle = (error?: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        };

        try {
          client.publish(message.topic, message.payload, { qos: 1 }, (error) => settle(error));
        } catch (error) {
          settle(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          try {
            client.end(true);
          } catch {
            // Preserve the timeout failure while still attempting forced cleanup.
          }
          settle(new Error(`MQTT close timed out after ${closeTimeoutMs}ms`));
        }, closeTimeoutMs);
        const settle = (error?: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        };

        try {
          client.end(false, {}, (error) => settle(error));
        } catch (error) {
          settle(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }
  };
}
