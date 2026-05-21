import crypto from 'node:crypto';

export type WebhookSignatureInput = {
  body: string;
  timestamp: string;
  secret: string;
};

export function createWebhookSignature(input: WebhookSignatureInput): string {
  return crypto
    .createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest('hex');
}

export function verifyWebhookSignature(
  input: WebhookSignatureInput & { signature: string; now?: Date }
): boolean {
  const parsedTimestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  const now = input.now ?? new Date();
  const ageMs = Math.abs(now.getTime() - parsedTimestamp);
  if (ageMs > 5 * 60_000) {
    return false;
  }

  const expected = createWebhookSignature(input);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(input.signature, 'hex');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
