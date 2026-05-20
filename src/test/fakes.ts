import type { MqttPublisher, SetCountCommand } from '../services/mqttPublisher.js';

export class FakeMqttPublisher implements MqttPublisher {
  public readonly setCountCommands: SetCountCommand[] = [];

  async publishSetCount(command: SetCountCommand): Promise<void> {
    this.setCountCommands.push(command);
  }

  async close(): Promise<void> {
    return undefined;
  }
}
