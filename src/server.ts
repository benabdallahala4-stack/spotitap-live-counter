import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { MqttPublisher } from './services/mqttPublisher.js';
import { registerAdminRoutes, type AdminCountingPort } from './routes/adminRoutes.js';
import { registerDeviceAdminRoutes, type DeviceAdminPort } from './routes/deviceAdminRoutes.js';
import { registerProvisioningRoutes, type ProvisioningPort } from './routes/provisioningRoutes.js';
import { registerPublicRoutes } from './routes/publicRoutes.js';

export type ServerOptions = {
  counting: AdminCountingPort;
  devices: DeviceAdminPort;
  provisioning: ProvisioningPort;
  mqtt: MqttPublisher;
  hashSecret: string;
  adminToken: string;
  woocommerceWebhookSecret: string;
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
  await registerAdminRoutes(app, options);
  await registerDeviceAdminRoutes(app, options);
  await registerProvisioningRoutes(app, options);

  app.addHook('onClose', async () => {
    await options.mqtt.close();
  });

  return app;
}
