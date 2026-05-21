# Counter Social Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin API endpoint to set a provisioned counter's social destination URL and activate its QR route for pilot operations.

**Architecture:** Keep this in the existing Fastify backend. Add a small repository method that updates `qr_routes` and `counters` together, then expose it through an admin-token protected route under `/admin/counters/:counterId/social-target`.

**Tech Stack:** TypeScript, Fastify, Zod, Drizzle/Postgres, Vitest.

---

## Scope Check

This plan enables the first manual pilot flow:

```text
WooCommerce provisions reserved counter
  -> admin enters Instagram/Facebook/TikTok URL
  -> backend updates QR route destination
  -> counter status becomes active
  -> /r/:slug redirects to the real social URL
```

Out of scope:

- Social OAuth.
- Customer-facing onboarding UI.
- Platform API verification.
- Device Wi-Fi pairing.

## File Map

### Modified files

| File | What changes |
|---|---|
| `src/repositories/counters.ts` | Add `configureCounterSocialTarget` repository method. |
| `src/routes/adminRoutes.ts` | Add `POST /admin/counters/:counterId/social-target`. |
| `src/routes/adminRoutes.test.ts` | Cover success, unauthorized, invalid URL, and missing counter paths. |

## Task 1: Add social target repository contract and route tests

**Files:**
- Modify: `src/repositories/counters.ts`
- Modify: `src/routes/adminRoutes.test.ts`

- [ ] **Step 1: Extend test fake counting object**

Add `configureCounterSocialTarget: vi.fn()` to the existing `createCounting()` helper in `src/routes/adminRoutes.test.ts`.

- [ ] **Step 2: Add failing route tests**

Add tests that:

- call `POST /admin/counters/counter-1/social-target` with admin bearer token and payload `{ destinationUrl, platformDeepLink }`;
- expect `200 { configured: true, counterId, destinationUrl }`;
- expect unauthorized requests to return `401`;
- expect `javascript:` destination URLs to return `400 { error: 'invalid_destination_url' }`;
- expect missing counters to return `404 { error: 'counter_not_found' }`.

- [ ] **Step 3: Run failing tests**

Run:

```bash
npm run test -- src/routes/adminRoutes.test.ts
```

Expected: FAIL because the route does not exist yet.

## Task 2: Implement repository and route

**Files:**
- Modify: `src/repositories/counters.ts`
- Modify: `src/routes/adminRoutes.ts`

- [ ] **Step 1: Add repository types and method**

In `src/repositories/counters.ts`, add:

```ts
export type ConfigureCounterSocialTargetInput = {
  counterId: string;
  destinationUrl: string;
  platformDeepLink: string;
};

export type ConfigureCounterSocialTargetResult = {
  counterId: string;
  destinationUrl: string;
  platformDeepLink: string;
};
```

Add the method to `CounterRepository`:

```ts
configureCounterSocialTarget(
  input: ConfigureCounterSocialTargetInput
): Promise<ConfigureCounterSocialTargetResult | null>;
```

Implement it with a transaction:

- update the counter status to `active`;
- update the linked `qr_routes` destination URL and platform deep link;
- return `null` if either counter or QR route is missing.

- [ ] **Step 2: Add admin route schema**

In `src/routes/adminRoutes.ts`, add Zod schema:

```ts
const socialTargetBodySchema = z.object({
  destinationUrl: z.string().url(),
  platformDeepLink: z.string().trim().min(1).max(500).default('')
});
```

Validate destination URLs so only `http:` and `https:` are accepted.

- [ ] **Step 3: Add route**

Add:

```text
POST /admin/counters/:counterId/social-target
```

Behavior:

- require existing admin token;
- reject invalid payload with `400 { error: 'invalid_payload' }`;
- reject non-http(s) destination URL with `400 { error: 'invalid_destination_url' }`;
- call `configureCounterSocialTarget`;
- return `404 { error: 'counter_not_found' }` when repository returns `null`;
- return `{ configured: true, counterId, destinationUrl, platformDeepLink }`.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm run test -- src/routes/adminRoutes.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/repositories/counters.ts src/routes/adminRoutes.ts src/routes/adminRoutes.test.ts docs/plans/2026-05-21-counter-social-configuration.md
git commit -m "feat(live-counter): add admin social target configuration"
```

## Task 3: Full verification

- [ ] **Step 1: Run full checks**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

## Self-Review

Spec coverage:

- Manual social URL setup for pilot counters: Task 2.
- Secure admin-only operation: Task 2.
- QR route activation: Task 2.

Intentional gaps:

- This is admin-only for the pilot. Customer self-service setup should become a separate authenticated app flow later.
