import { describe, expect, it, vi } from 'vitest';
import { createWebhookSignature } from '../security/hmac.js';
import { createTestApp } from '../test/app.js';
import { FakeMqttPublisher } from '../test/fakes.js';

const hashSecret = 'test-hash-secret';
const woocommerceWebhookSecret = 'test-woocommerce-webhook-secret';

function createCounting() {
  return {
    recordQrScan: vi.fn(),
    getCounterDeviceTarget: vi.fn(),
    configureCounterSocialTarget: vi.fn(),
    setVerifiedCount: vi.fn(),
    listPrototypeTargets: vi.fn()
  };
}

function createProvisioning() {
  return {
    provisionWooOrder: vi.fn().mockResolvedValue({
      counters: [
        {
          customerId: 'customer-1',
          orderId: 'order-1',
          counterId: 'counter-1',
          deviceId: 'device-1',
          qrSlug: 'wc-123-instagram-1',
          qrUrl: 'http://localhost:4100/r/wc-123-instagram-1'
        }
      ]
    })
  };
}

function signedHeaders(body: string, secret = woocommerceWebhookSecret) {
  const timestamp = new Date().toISOString();
  return {
    'x-spotitap-timestamp': timestamp,
    'x-spotitap-signature': createWebhookSignature({ body, timestamp, secret })
  };
}

describe('POST /integrations/woocommerce/orders', () => {
  it('provisions counters from a valid signed WooCommerce order payload', async () => {
    const mqtt = new FakeMqttPublisher();
    const provisioning = createProvisioning();
    const app = await createTestApp({
      counting: createCounting(),
      mqtt,
      hashSecret,
      provisioning,
      woocommerceWebhookSecret
    });
    const body = JSON.stringify({
      wooOrderId: 123,
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      quantity: 1
    });

    const response = await app.inject({
      method: 'POST',
      url: '/integrations/woocommerce/orders',
      headers: {
        'content-type': 'application/json',
        ...signedHeaders(body)
      },
      payload: body
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      provisioned: true,
      counters: [
        {
          customerId: 'customer-1',
          orderId: 'order-1',
          counterId: 'counter-1',
          deviceId: 'device-1',
          qrSlug: 'wc-123-instagram-1',
          qrUrl: 'http://localhost:4100/r/wc-123-instagram-1'
        }
      ]
    });
    expect(provisioning.provisionWooOrder).toHaveBeenCalledWith({
      wooOrderId: 123,
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      quantity: 1
    });

    await app.close();
  });

  it('rejects requests with an invalid signature', async () => {
    const mqtt = new FakeMqttPublisher();
    const provisioning = createProvisioning();
    const app = await createTestApp({
      counting: createCounting(),
      mqtt,
      hashSecret,
      provisioning,
      woocommerceWebhookSecret
    });
    const body = JSON.stringify({
      wooOrderId: 123,
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      quantity: 1
    });

    const response = await app.inject({
      method: 'POST',
      url: '/integrations/woocommerce/orders',
      headers: {
        'content-type': 'application/json',
        ...signedHeaders(body, 'wrong-secret-0123456789')
      },
      payload: body
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'invalid_signature' });
    expect(provisioning.provisionWooOrder).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects invalid provisioning payloads', async () => {
    const mqtt = new FakeMqttPublisher();
    const provisioning = createProvisioning();
    const app = await createTestApp({
      counting: createCounting(),
      mqtt,
      hashSecret,
      provisioning,
      woocommerceWebhookSecret
    });
    const body = JSON.stringify({
      wooOrderId: 123,
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'youtube',
      sku: 'spotitap-live-instagram',
      quantity: 1
    });

    const response = await app.inject({
      method: 'POST',
      url: '/integrations/woocommerce/orders',
      headers: {
        'content-type': 'application/json',
        ...signedHeaders(body)
      },
      payload: body
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
    expect(provisioning.provisionWooOrder).not.toHaveBeenCalled();

    await app.close();
  });
});
