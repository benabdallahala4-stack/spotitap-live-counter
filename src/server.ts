import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { MqttPublisher } from './services/mqttPublisher.js';
import { registerPublicRoutes, type CountingPort } from './routes/publicRoutes.js';

export type ServerOptions = {
  counting: CountingPort;
  mqtt: MqttPublisher;
  hashSecret: string;
  logger?: FastifyServerOptions['logger'];
  trustProxy?: FastifyServerOptions['trustProxy'];
};

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: options.trustProxy ?? false
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
