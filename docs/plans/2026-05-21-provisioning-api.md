# Live Counter Provisioning API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend provisioning API so the Live Counter service can create pilot customers, devices, counters, and QR routes from signed server-side requests instead of relying on seed data.

**Architecture:** Keep this slice inside `/home/ala/gitlab/spotitap-live-counter`. Add a small provisioning service/repository and protected API routes under `/integrations/woocommerce/orders` and `/admin/devices`. Use an HMAC signature for WooCommerce-style provisioning requests and the existing `ADMIN_TOKEN` for prototype admin device pre-registration. This plan does not modify the WordPress repo yet.

**Tech Stack:** TypeScript, Fastify, Zod, Postgres/Drizzle, Vitest.

---

## Scope Check

This plan builds the backend side of provisioning only:

```text
signed order payload
  -> customer upsert
  -> device pre-registration or placeholder device binding
  -> counter reservation
  -> QR route creation
  -> provisioning response
```

Out of scope:

- WordPress/WooCommerce plugin webhook sender
- customer PWA
- email activation flow
- social OAuth
- real factory device import CSV

## File Map

### New files

| File | Purpose |
|---|---|
| `src/security/hmac.ts` | Verify timestamped HMAC signatures |
| `src/security/hmac.test.ts` | HMAC verification tests |
| `src/repositories/provisioning.ts` | DB operations for customer/order/device/counter/QR provisioning |
| `src/services/provisioning.ts` | Validates provisioning intent and orchestrates repository calls |
| `src/services/provisioning.test.ts` | Service unit tests with fake repository |
| `src/routes/provisioningRoutes.ts` | Signed WooCommerce-style provisioning route |
| `src/routes/provisioningRoutes.test.ts` | Route tests for signature and success/failure paths |
| `src/routes/deviceAdminRoutes.ts` | Admin device pre-registration route |
| `src/routes/deviceAdminRoutes.test.ts` | Admin device route tests |

### Modified files

| File | What changes |
|---|---|
| `.env.example` | Add `WOOCOMMERCE_WEBHOOK_SECRET` |
| `src/config.ts` | Parse webhook secret |
| `src/config.test.ts` | Cover webhook secret |
| `src/db/schema.ts` | Add `orders` table |
| `src/db/migrate.ts` | Create `orders` table |
| `src/server.ts` | Register provisioning/admin device routes |
| `src/test/app.ts` | Provide test default webhook secret |

## Task 1: Add HMAC signature utility

**Files:**
- Create: `src/security/hmac.ts`
- Test: `src/security/hmac.test.ts`

- [ ] **Step 1: Write failing HMAC tests**

Create `src/security/hmac.test.ts`:

```ts
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
    const signature = crypto.createHmac('sha256', 'wrong-secret').update(`${timestamp}.${body}`).digest('hex');

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
```

- [ ] **Step 2: Run failing test**

```bash
npm run test -- src/security/hmac.test.ts
```

Expected: FAIL with missing `hmac.js`.

- [ ] **Step 3: Create `src/security/hmac.ts`**

```ts
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

export function verifyWebhookSignature(input: WebhookSignatureInput & { now?: Date }): boolean {
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
```

- [ ] **Step 4: Run tests and build**

```bash
npm run test -- src/security/hmac.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(live-counter): add webhook hmac verification"
```

## Task 2: Add orders schema and config secret

**Files:**
- Modify: `.env.example`
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Add config test expectations**

In `src/config.test.ts`, update the happy-path input with:

```ts
WOOCOMMERCE_WEBHOOK_SECRET: 'woocommerce-webhook-secret-012345'
```

and expected config with:

```ts
woocommerceWebhookSecret: 'woocommerce-webhook-secret-012345'
```

Add a test:

```ts
it('requires a meaningful WooCommerce webhook secret', () => {
  expect(() =>
    readConfig({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      MQTT_URL: 'mqtt://localhost:1883',
      HASH_SECRET: '0123456789abcdef',
      ADMIN_TOKEN: '0123456789abcdef01234567',
      WOOCOMMERCE_WEBHOOK_SECRET: 'short',
      PUBLIC_BASE_URL: 'http://localhost:4999'
    })
  ).toThrow(/WOOCOMMERCE_WEBHOOK_SECRET/);
});
```

- [ ] **Step 2: Run failing config test**

```bash
npm run test -- src/config.test.ts
```

Expected: FAIL until config is updated.

- [ ] **Step 3: Update config and env example**

In `.env.example`, add:

```env
WOOCOMMERCE_WEBHOOK_SECRET=replace-with-at-least-24-random-chars
```

In `src/config.ts`, add:

```ts
WOOCOMMERCE_WEBHOOK_SECRET: z.string().trim().min(24),
```

to the schema, add `woocommerceWebhookSecret: string` to `AppConfig`, and return `parsed.WOOCOMMERCE_WEBHOOK_SECRET`.

- [ ] **Step 4: Add orders table to Drizzle schema**

In `src/db/schema.ts`, add:

```ts
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  wooOrderId: text('woo_order_id').notNull().unique(),
  status: text('status').notNull().default('provisioned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 5: Add orders DDL to migration**

In `src/db/migrate.ts`, after `customers` table creation, add:

```sql
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  woo_order_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'provisioned',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 6: Run tests, build, migrate**

```bash
npm run test -- src/config.test.ts
npm run build
npm run db:migrate
```

Expected: PASS and migration prints schema ready.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(live-counter): add provisioning order schema"
```

## Task 3: Add provisioning repository and service

**Files:**
- Create: `src/repositories/provisioning.ts`
- Create: `src/services/provisioning.ts`
- Test: `src/services/provisioning.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/services/provisioning.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createProvisioningService, type ProvisioningRepository } from './provisioning.js';

function createRepo(overrides: Partial<ProvisioningRepository> = {}): ProvisioningRepository {
  return {
    provisionCounterOrder: vi.fn().mockResolvedValue({
      customerId: 'customer-1',
      orderId: 'order-1',
      counterId: 'counter-1',
      deviceId: 'device-1',
      qrSlug: 'wc-123-instagram-1',
      qrUrl: 'http://localhost:4100/r/wc-123-instagram-1'
    }),
    ...overrides
  };
}

describe('createProvisioningService', () => {
  it('provisions a single Instagram counter order', async () => {
    const repo = createRepo();
    const service = createProvisioningService(repo, { publicBaseUrl: 'http://localhost:4100' });

    const result = await service.provisionWooOrder({
      wooOrderId: 123,
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      quantity: 1
    });

    expect(repo.provisionCounterOrder).toHaveBeenCalledWith({
      wooOrderId: '123',
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      index: 1,
      qrSlug: 'wc-123-instagram-1',
      publicBaseUrl: 'http://localhost:4100'
    });
    expect(result.counters).toHaveLength(1);
    expect(result.counters[0].qrUrl).toBe('http://localhost:4100/r/wc-123-instagram-1');
  });

  it('rejects unsupported quantities', async () => {
    const service = createProvisioningService(createRepo(), { publicBaseUrl: 'http://localhost:4100' });

    await expect(
      service.provisionWooOrder({
        wooOrderId: 123,
        email: 'owner@example.com',
        name: 'Cafe Example',
        platform: 'instagram',
        sku: 'spotitap-live-instagram',
        quantity: 0
      })
    ).rejects.toThrow(/quantity/);
  });
});
```

- [ ] **Step 2: Run failing service test**

```bash
npm run test -- src/services/provisioning.test.ts
```

Expected: FAIL with missing `provisioning.js`.

- [ ] **Step 3: Create provisioning service**

Create `src/services/provisioning.ts`:

```ts
export type ProvisioningPlatform = 'instagram' | 'facebook' | 'tiktok';

export type WooOrderProvisionInput = {
  wooOrderId: number | string;
  email: string;
  name: string;
  platform: ProvisioningPlatform;
  sku: string;
  quantity: number;
};

export type ProvisionedCounter = {
  customerId: string;
  orderId: string;
  counterId: string;
  deviceId: string;
  qrSlug: string;
  qrUrl: string;
};

export type ProvisioningRepository = {
  provisionCounterOrder(input: {
    wooOrderId: string;
    email: string;
    name: string;
    platform: ProvisioningPlatform;
    sku: string;
    index: number;
    qrSlug: string;
    publicBaseUrl: string;
  }): Promise<ProvisionedCounter>;
};

export function createProvisioningService(
  repo: ProvisioningRepository,
  options: { publicBaseUrl: string }
) {
  return {
    async provisionWooOrder(input: WooOrderProvisionInput): Promise<{ counters: ProvisionedCounter[] }> {
      if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 25) {
        throw new Error('quantity must be between 1 and 25');
      }

      const counters: ProvisionedCounter[] = [];
      const wooOrderId = String(input.wooOrderId);
      for (let index = 1; index <= input.quantity; index += 1) {
        const qrSlug = `wc-${wooOrderId}-${input.platform}-${index}`;
        counters.push(
          await repo.provisionCounterOrder({
            wooOrderId,
            email: input.email,
            name: input.name,
            platform: input.platform,
            sku: input.sku,
            index,
            qrSlug,
            publicBaseUrl: options.publicBaseUrl
          })
        );
      }

      return { counters };
    }
  };
}
```

- [ ] **Step 4: Create provisioning repository**

Create `src/repositories/provisioning.ts` with a transaction that:

1. upserts `customers` by email
2. upserts `orders` by `wooOrderId`
3. inserts a manufactured placeholder device serial `PENDING-{wooOrderId}-{index}`
4. inserts/upserts `counters` by QR slug
5. inserts/upserts `qr_routes` by QR slug
6. returns IDs and QR URL

Use existing schema objects: `customers`, `devices`, `orders`, `counters`, `qrRoutes`.

- [ ] **Step 5: Run tests and build**

```bash
npm run test -- src/services/provisioning.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(live-counter): add provisioning service"
```

## Task 4: Add signed WooCommerce provisioning route

**Files:**
- Create: `src/routes/provisioningRoutes.ts`
- Test: `src/routes/provisioningRoutes.test.ts`
- Modify: `src/server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing route tests**

Create tests covering:

- valid signed `POST /integrations/woocommerce/orders` returns provisioned counters
- invalid signature returns `401 { error: 'invalid_signature' }`
- invalid payload returns `400 { error: 'invalid_payload' }`

- [ ] **Step 2: Implement route**

Route requirements:

- Read raw body for HMAC verification. If Fastify JSON parsing makes raw body hard, use `JSON.stringify(request.body)` consistently in tests and route for this prototype.
- Headers:
  - `x-spotitap-timestamp`
  - `x-spotitap-signature`
- Validate payload with Zod:
  - `wooOrderId`
  - `email`
  - `name`
  - `platform`: `instagram|facebook|tiktok`
  - `sku`
  - `quantity`: int 1..25
- Call provisioning service.
- Return `{ provisioned: true, counters }`.

- [ ] **Step 3: Wire server/index**

Add provisioning dependency to server options:

```ts
provisioning: ProvisioningPort;
woocommerceWebhookSecret: string;
```

Register provisioning routes in `createServer`.

In `src/index.ts`, create provisioning repository/service and pass webhook secret from config.

- [ ] **Step 4: Run tests/build**

```bash
npm run test -- src/routes/provisioningRoutes.test.ts src/services/provisioning.test.ts src/security/hmac.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(live-counter): add signed provisioning route"
```

## Task 5: Add admin device pre-registration route

**Files:**
- Create: `src/routes/deviceAdminRoutes.ts`
- Test: `src/routes/deviceAdminRoutes.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write failing tests**

Test:

- `POST /admin/devices` with admin token creates a manufactured device
- missing admin token returns 401
- duplicate serial is idempotent

- [ ] **Step 2: Implement route**

Payload:

```json
{
  "serial": "SP-LIVE-DEV-0002",
  "claimCode": "CLAIM-0002",
  "mqttUsername": "device-dev-0002",
  "mqttPassword": "dev-password"
}
```

Store hashes for claim code and MQTT password using SHA-256 for prototype.

- [ ] **Step 3: Wire server**

Register the route using existing `ADMIN_TOKEN` auth helper or local equivalent.

- [ ] **Step 4: Run tests/build**

```bash
npm run test -- src/routes/deviceAdminRoutes.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(live-counter): add admin device registration route"
```

## Task 6: Full verification

- [ ] **Step 1: Run full automated checks**

```bash
npm run test
npm run build
npm run db:migrate
```

- [ ] **Step 2: Start server and verify signed provisioning manually**

Use a small Node command or test helper to generate the HMAC signature, then `curl` the provisioning endpoint.

Expected:

- HTTP 200
- response contains a counter with QR URL
- DB contains customer/order/counter/qr route

- [ ] **Step 3: Commit docs if README is updated**

If manual provisioning instructions are added to README:

```bash
git add README.md
git commit -m "docs(live-counter): document provisioning api"
```

## Self-Review

Spec coverage:

- Backend provisioning endpoint: Tasks 1-4.
- Device pre-registration: Task 5.
- Config/security: Tasks 1-2.
- Verification: Task 6.

Intentional gaps:

- WordPress webhook sender.
- customer activation emails.
- device claim flow.
- social OAuth.

Completeness scan:

- Each task includes exact paths, expected behavior, tests, and verification commands.
