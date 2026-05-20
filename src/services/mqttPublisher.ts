import mqtt from 'mqtt';

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

export function buildSetCountMessage(command: SetCountCommand): MqttMessage {
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
}): MqttPublisher {
  const client = mqtt.connect(options.url, {
    username: options.username || undefined,
    password: options.password || undefined
  });

  return {
    async publishSetCount(command) {
      const message = buildSetCountMessage(command);
      await new Promise<void>((resolve, reject) => {
        client.publish(message.topic, message.payload, { qos: 1 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    async close() {
      await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    }
  };
}
