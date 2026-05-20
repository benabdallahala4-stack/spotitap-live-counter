import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CounterDeviceTarget } from '../repositories/counters.js';
import type { MqttPublisher } from '../services/mqttPublisher.js';
import type { CountingPort } from './publicRoutes.js';

const testCountBodySchema = z.object({
  target: z.number().int().min(0).max(9_999_999)
});

export type AdminCountingPort = CountingPort & {
  getCounterDeviceTarget(counterId: string): Promise<CounterDeviceTarget | null>;
};

export type AdminRoutesOptions = {
  counting: AdminCountingPort;
  mqtt: MqttPublisher;
};

export async function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminRoutesOptions
): Promise<void> {
  app.post<{ Params: { counterId: string } }>(
    '/admin/counters/:counterId/test-count',
    async (request, reply) => {
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
}
