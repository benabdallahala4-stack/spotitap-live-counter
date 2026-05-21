import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  DATABASE_URL: z.string().url(),
  MQTT_URL: z.string().url(),
  MQTT_USERNAME: z.string().default(''),
  MQTT_PASSWORD: z.string().default(''),
  HASH_SECRET: z.string().trim().min(16),
  ADMIN_TOKEN: z.string().trim().min(24),
  WOOCOMMERCE_WEBHOOK_SECRET: z.string().trim().min(24),
  PUBLIC_BASE_URL: z.string().url()
});

export type AppConfig = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  mqttUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  hashSecret: string;
  adminToken: string;
  woocommerceWebhookSecret: string;
  publicBaseUrl: string;
};

export function readConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(source);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    mqttUrl: parsed.MQTT_URL,
    mqttUsername: parsed.MQTT_USERNAME,
    mqttPassword: parsed.MQTT_PASSWORD,
    hashSecret: parsed.HASH_SECRET,
    adminToken: parsed.ADMIN_TOKEN,
    woocommerceWebhookSecret: parsed.WOOCOMMERCE_WEBHOOK_SECRET,
    publicBaseUrl: parsed.PUBLIC_BASE_URL
  };
}
