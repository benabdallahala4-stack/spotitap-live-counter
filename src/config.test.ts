import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

describe('readConfig', () => {
  it('parses required runtime configuration', () => {
    const config = readConfig({
      NODE_ENV: 'test',
      PORT: '4999',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      MQTT_URL: 'mqtt://localhost:1883',
      HASH_SECRET: '0123456789abcdef',
      PUBLIC_BASE_URL: 'http://localhost:4999'
    });

    expect(config).toEqual({
      nodeEnv: 'test',
      port: 4999,
      databaseUrl: 'postgres://user:pass@localhost:5432/db',
      mqttUrl: 'mqtt://localhost:1883',
      mqttUsername: '',
      mqttPassword: '',
      hashSecret: '0123456789abcdef',
      publicBaseUrl: 'http://localhost:4999'
    });
  });

  it('rejects invalid ports', () => {
    expect(() =>
      readConfig({
        PORT: 'not-a-port',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        MQTT_URL: 'mqtt://localhost:1883',
        HASH_SECRET: '0123456789abcdef',
        PUBLIC_BASE_URL: 'http://localhost:4999'
      })
    ).toThrow(/PORT/);
  });

  it('requires a meaningful hash secret', () => {
    expect(() =>
      readConfig({
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        MQTT_URL: 'mqtt://localhost:1883',
        HASH_SECRET: 'too-short',
        PUBLIC_BASE_URL: 'http://localhost:4999'
      })
    ).toThrow(/HASH_SECRET/);
  });
});
