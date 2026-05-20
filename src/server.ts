import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { MqttPublisher } from './services/mqttPublisher.js';
import { registerPublicRoutes, type CountingPort } from './routes/publicRoutes.js';

export type ServerOptions = {
  counting: CountingPort;
  mqtt: MqttPublisher;
};

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true
  });

  await app.register(cors, {
    origin: true
  });

  app.get('/health', async () => ({ ok: true }));

  await registerPublicRoutes(app, options);

  app.addHook('onClose', async () => {
    await options.mqtt.close();
  });

  return app;
}
