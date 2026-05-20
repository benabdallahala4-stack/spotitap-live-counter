import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MqttPublisher } from '../services/mqttPublisher.js';
import type { QrScanInput, QrScanResult } from '../services/counting.js';

export type CountingPort = {
  recordQrScan(input: QrScanInput): Promise<QrScanResult>;
};

export type PublicRoutesOptions = {
  counting: CountingPort;
  mqtt: MqttPublisher;
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getClientIp(request: { headers: Record<string, string | string[] | undefined>; ip: string }): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0]?.split(',')[0]?.trim() || request.ip;
  }

  return forwardedFor?.split(',')[0]?.trim() || request.ip;
}

export async function registerPublicRoutes(
  app: FastifyInstance,
  options: PublicRoutesOptions
): Promise<void> {
  app.get<{ Params: { slug: string } }>('/r/:slug', async (request, reply) => {
    const userAgent = request.headers['user-agent'] ?? '';
    const normalizedUserAgent = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
    const ip = getClientIp(request);
    const result = await options.counting.recordQrScan({
      slug: request.params.slug,
      fingerprintHash: sha256(`${ip}:${normalizedUserAgent}`),
      ipHash: sha256(ip),
      userAgent: normalizedUserAgent
    });

    if (
      result.optimisticApplied &&
      result.deviceId &&
      result.displayedCount !== undefined &&
      result.optimisticEventId
    ) {
      await options.mqtt.publishSetCount({
        deviceId: result.deviceId,
        counterId: result.counterId,
        target: result.displayedCount,
        reason: 'optimistic_scan',
        eventId: result.optimisticEventId,
        sentAt: new Date()
      });
    }

    return reply.redirect(result.destinationUrl);
  });
}
