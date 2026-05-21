import 'dotenv/config';
import { createDb, createPool } from './db/client.js';
import { readConfig } from './config.js';
import { createCounterRepository } from './repositories/counters.js';
import { createCountingService } from './services/counting.js';
import { createMqttPublisher } from './services/mqttPublisher.js';
import { createServer } from './server.js';

async function main() {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  const db = createDb(pool);
  const repo = createCounterRepository(db);
  const counting = createCountingService(repo, {
    optimisticTtlMinutes: 60,
    fingerprintCooldownMinutes: 120
  });
  const mqtt = createMqttPublisher({
    url: config.mqttUrl,
    username: config.mqttUsername,
    password: config.mqttPassword
  });
  const app = await createServer({
    counting,
    mqtt,
    hashSecret: config.hashSecret,
    adminToken: config.adminToken
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
