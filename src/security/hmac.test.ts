import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createWebhookSignature, verifyWebhookSignature } from './hmac.js';

describe('webhook HMAC', () => {
  it('accepts a valid timestamped signature', () => {
    const body = JSON.stringify({ wooOrderId: 123, platform: 'instagram' });
    const timestamp = '2026-05-21T12:00:00.000Z';
    const secret = 'webhook-secret-0123456789';
    const signature = createWebhookSignature({ body, timestamp, secret });

    expect(
      verifyWebhookSignature({
        body,
        timestamp,
        signature,
        secret,
        now: new Date('2026-05-21T12:03:00.000Z')
      })
    ).toBe(true);
  });

  it('rejects stale timestamps and bad signatures', () => {
    const body = JSON.stringify({ wooOrderId: 123 });
    const timestamp = '2026-05-21T11:00:00.000Z';
    const secret = 'webhook-secret-0123456789';
    const signature = crypto
      .createHmac('sha256', 'wrong-secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');

    expect(
      verifyWebhookSignature({
        body,
        timestamp,
        signature,
        secret,
        now: new Date('2026-05-21T12:00:00.000Z')
      })
    ).toBe(false);
  });
});
