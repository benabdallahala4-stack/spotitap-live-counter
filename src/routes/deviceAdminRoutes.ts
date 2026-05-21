import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const deviceRegistrationBodySchema = z.object({
  serial: z.string().trim().min(3).max(120),
  claimCode: z.string().trim().min(6).max(120),
  mqttUsername: z.string().trim().min(3).max(120),
  mqttPassword: z.string().trim().min(8).max(240)
});

export type RegisteredDevice = {
  id: string;
  serial: string;
  status: string;
};

export type DeviceAdminPort = {
  registerDevice(input: {
    serial: string;
    claimCodeHash: string;
    mqttUsername: string;
    mqttPasswordHash: string;
  }): Promise<RegisteredDevice>;
};

export type DeviceAdminRoutesOptions = {
  adminToken: string;
  devices: DeviceAdminPort;
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getRequestToken(request: { headers: Record<string, string | string[] | undefined> }): string {
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerToken = request.headers['x-admin-token'];
  if (typeof headerToken === 'string') {
    return headerToken.trim();
  }

  return '';
}

export async function registerDeviceAdminRoutes(
  app: FastifyInstance,
  options: DeviceAdminRoutesOptions
): Promise<void> {
  app.post('/admin/devices', async (request, reply) => {
    if (getRequestToken(request) !== options.adminToken) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const body = deviceRegistrationBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_device' });
    }

    const device = await options.devices.registerDevice({
      serial: body.data.serial,
      claimCodeHash: sha256(body.data.claimCode),
      mqttUsername: body.data.mqttUsername,
      mqttPasswordHash: sha256(body.data.mqttPassword)
    });

    return {
      created: true,
      device
    };
  });
}
