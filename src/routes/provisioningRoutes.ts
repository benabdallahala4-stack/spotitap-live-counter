import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyWebhookSignature } from '../security/hmac.js';
import type { ProvisioningService } from '../services/provisioning.js';

const wooOrderPayloadSchema = z.object({
  wooOrderId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  email: z.string().email(),
  name: z.string().trim().min(1),
  platform: z.enum(['instagram', 'facebook', 'tiktok']),
  sku: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(25)
});

export type ProvisioningPort = Pick<ProvisioningService, 'provisionWooOrder'>;

export type ProvisioningRoutesOptions = {
  provisioning: ProvisioningPort;
  woocommerceWebhookSecret: string;
};

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function getSignatureBody(body: unknown): string {
  return JSON.stringify(body ?? {});
}

export async function registerProvisioningRoutes(
  app: FastifyInstance,
  options: ProvisioningRoutesOptions
): Promise<void> {
  app.post('/integrations/woocommerce/orders', async (request, reply) => {
    const timestamp = getHeaderValue(request.headers['x-spotitap-timestamp']);
    const signature = getHeaderValue(request.headers['x-spotitap-signature']);
    const bodyForSignature = getSignatureBody(request.body);

    const signatureValid = verifyWebhookSignature({
      body: bodyForSignature,
      timestamp,
      signature,
      secret: options.woocommerceWebhookSecret
    });
    if (!signatureValid) {
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    const payload = wooOrderPayloadSchema.safeParse(request.body);
    if (!payload.success) {
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    try {
      const result = await options.provisioning.provisionWooOrder(payload.data);
      return {
        provisioned: true,
        counters: result.counters
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to provision WooCommerce live counter order');
      return reply.code(500).send({ error: 'provisioning_failed' });
    }
  });
}
