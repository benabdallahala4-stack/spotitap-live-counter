import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ConfigureCounterSocialTargetInput,
  ConfigureCounterSocialTargetResult,
  CounterDeviceTarget,
  PrototypeTarget,
  SetVerifiedCountInput,
  SetVerifiedCountResult
} from '../repositories/counters.js';
import type { MqttPublisher } from '../services/mqttPublisher.js';
import type { CountingPort } from './publicRoutes.js';

const testCountBodySchema = z.object({
  target: z.number().int().min(0).max(9_999_999)
});

const socialTargetBodySchema = z.object({
  destinationUrl: z.string().url(),
  platformDeepLink: z.string().trim().min(1).max(500).default('')
});

const verifiedCountBodySchema = z.object({
  verifiedCount: z.number().int().min(0).max(9_999_999),
  source: z.string().trim().min(1).max(100).default('manual_admin')
});

export type AdminCountingPort = CountingPort & {
  getCounterDeviceTarget(counterId: string): Promise<CounterDeviceTarget | null>;
  configureCounterSocialTarget(
    input: ConfigureCounterSocialTargetInput
  ): Promise<ConfigureCounterSocialTargetResult | null>;
  setVerifiedCount(input: SetVerifiedCountInput): Promise<SetVerifiedCountResult | null>;
  listPrototypeTargets(): Promise<PrototypeTarget[]>;
};

export type AdminRoutesOptions = {
  counting: AdminCountingPort;
  mqtt: MqttPublisher;
  adminToken: string;
};

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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminRoutesOptions
): Promise<void> {
  app.get('/admin/prototype-targets', async (request, reply) => {
    if (getRequestToken(request) !== options.adminToken) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    return {
      targets: await options.counting.listPrototypeTargets()
    };
  });

  app.post<{ Params: { counterId: string } }>(
    '/admin/counters/:counterId/test-count',
    async (request, reply) => {
      if (getRequestToken(request) !== options.adminToken) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const body = testCountBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_target' });
      }

      const target = await options.counting.getCounterDeviceTarget(request.params.counterId);
      if (!target) {
        return reply.code(404).send({ error: 'counter_not_found' });
      }

      await options.mqtt.publishSetCount({
        deviceId: target.deviceId,
        counterId: target.counterId,
        target: body.data.target,
        reason: 'admin_test',
        eventId: 'admin-test',
        sentAt: new Date()
      });

      return {
        sent: true,
        deviceId: target.deviceId,
        target: body.data.target
      };
    }
  );

  app.post<{ Params: { counterId: string } }>(
    '/admin/counters/:counterId/social-target',
    async (request, reply) => {
      if (getRequestToken(request) !== options.adminToken) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const body = socialTargetBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_payload' });
      }

      if (!isHttpUrl(body.data.destinationUrl)) {
        return reply.code(400).send({ error: 'invalid_destination_url' });
      }

      const configured = await options.counting.configureCounterSocialTarget({
        counterId: request.params.counterId,
        destinationUrl: body.data.destinationUrl,
        platformDeepLink: body.data.platformDeepLink
      });
      if (!configured) {
        return reply.code(404).send({ error: 'counter_not_found' });
      }

      return {
        configured: true,
        counterId: configured.counterId,
        destinationUrl: configured.destinationUrl,
        platformDeepLink: configured.platformDeepLink
      };
    }
  );

  app.post<{ Params: { counterId: string } }>(
    '/admin/counters/:counterId/verified-count',
    async (request, reply) => {
      if (getRequestToken(request) !== options.adminToken) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const body = verifiedCountBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_verified_count' });
      }

      const reconciled = await options.counting.setVerifiedCount({
        counterId: request.params.counterId,
        verifiedCount: body.data.verifiedCount,
        source: body.data.source,
        rawPayload: body.data
      });
      if (!reconciled) {
        return reply.code(404).send({ error: 'counter_not_found' });
      }

      await options.mqtt.publishSetCount({
        deviceId: reconciled.deviceId,
        counterId: reconciled.counterId,
        target: reconciled.displayedCount,
        reason: 'verified_count',
        eventId: 'verified-count',
        sentAt: new Date()
      });

      return {
        reconciled: true,
        counterId: reconciled.counterId,
        deviceId: reconciled.deviceId,
        displayedCount: reconciled.displayedCount
      };
    }
  );
}
