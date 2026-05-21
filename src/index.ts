import 'dotenv/config';
import { createDb, createPool } from './db/client.js';
import { readConfig } from './config.js';
import { createCounterRepository } from './repositories/counters.js';
import { createDeviceAdminRepository } from './repositories/devices.js';
import { createProvisioningRepository } from './repositories/provisioning.js';
import { createCountingService } from './services/counting.js';
import { createMqttPublisher } from './services/mqttPublisher.js';
import { createProvisioningService } from './services/provisioning.js';
import { createServer } from './server.js';

async function main() {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  const db = createDb(pool);
  const repo = createCounterRepository(db);
  const devices = createDeviceAdminRepository(db);
  const provisioningRepo = createProvisioningRepository(db);
  const counting = createCountingService(repo, {
    optimisticTtlMinutes: 60,
    fingerprintCooldownMinutes: 120
  });
  const provisioning = createProvisioningService(provisioningRepo, {
    publicBaseUrl: config.publicBaseUrl
  });
  const mqtt = createMqttPublisher({
    url: config.mqttUrl,
    username: config.mqttUsername,
    password: config.mqttPassword
  });
  const app = await createServer({
    counting,
    devices,
    provisioning,
    mqtt,
    hashSecret: config.hashSecret,
    adminToken: config.adminToken,
    woocommerceWebhookSecret: config.woocommerceWebhookSecret
  });

  const close = async () => {
    await app.close();
    await pool.end();
  };

  process.on('SIGINT', () => void close().then(() => process.exit(0)));
  process.on('SIGTERM', () => void close().then(() => process.exit(0)));

  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
