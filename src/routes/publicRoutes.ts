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
  hashSecret: string;
};

export function hashScanValue(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function validateRedirectUrl(destinationUrl: string): URL | undefined {
  try {
    const url = new URL(destinationUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function isRouteNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('QR route not found');
}

export async function registerPublicRoutes(
  app: FastifyInstance,
  options: PublicRoutesOptions
): Promise<void> {
  app.get<{ Params: { slug: string } }>('/r/:slug', async (request, reply) => {
    const userAgent = request.headers['user-agent'] ?? '';
    const normalizedUserAgent = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
    let result;

    try {
      result = await options.counting.recordQrScan({
        slug: request.params.slug,
        fingerprintHash: hashScanValue(options.hashSecret, `${request.ip}:${normalizedUserAgent}`),
        ipHash: hashScanValue(options.hashSecret, request.ip),
        userAgent: normalizedUserAgent
      });
    } catch (error) {
      if (isRouteNotFoundError(error)) {
        return reply.code(404).send({ error: 'route_not_found' });
      }

      request.log.error({ err: error, slug: request.params.slug }, 'Failed to record QR scan');
      return reply.code(500).send({ error: 'scan_failed' });
    }

    const redirectUrl = validateRedirectUrl(result.destinationUrl);
    if (!redirectUrl) {
      request.log.error(
        { slug: request.params.slug, destinationUrl: result.destinationUrl },
        'Invalid QR redirect destination URL'
      );
      return reply.code(502).send({ error: 'invalid_destination_url' });
    }

    if (
      result.optimisticApplied &&
      result.deviceId &&
      result.displayedCount !== undefined &&
      result.optimisticEventId
    ) {
      const command = {
        deviceId: result.deviceId,
        counterId: result.counterId,
        target: result.displayedCount,
        reason: 'optimistic_scan',
        eventId: result.optimisticEventId,
        sentAt: new Date()
      } as const;

      void options.mqtt.publishSetCount(command).catch((error) => {
        request.log.warn(
          {
            err: error,
            slug: request.params.slug,
            counterId: command.counterId,
            deviceId: command.deviceId,
            eventId: command.eventId
          },
          'Failed to publish optimistic QR scan count'
        );
      });
    }

    return reply.redirect(redirectUrl.toString());
  });
}
