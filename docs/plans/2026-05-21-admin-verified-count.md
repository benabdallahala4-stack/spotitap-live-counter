# Admin Verified Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin API endpoint to set a counter's authoritative verified count, clear optimistic deltas, save a snapshot, and publish the corrected count to the device.

**Architecture:** Extend the existing counter repository and counting service with a `setVerifiedCount` operation. Expose it through `POST /admin/counters/:counterId/verified-count`, protected by the existing admin token and using the existing MQTT set-count publisher.

**Tech Stack:** TypeScript, Fastify, Zod, Drizzle/Postgres, MQTT.js abstraction, Vitest.

---

## Scope Check

This plan builds a practical reconciliation control for pilot operations:

```text
manual/social API count check
  -> admin endpoint
  -> verified_count = count
  -> optimistic_delta = 0
  -> displayed_count = count
  -> count snapshot saved
  -> MQTT set-count command sent
```

Out of scope:

- Automated scheduled polling.
- Platform OAuth/API integrations.
- Customer-facing controls.

## File Map

### Modified files

| File | What changes |
|---|---|
| `src/repositories/counters.ts` | Add `setVerifiedCount` repository method. |
| `src/services/counting.ts` | Expose `setVerifiedCount` service method. |
| `src/services/counting.test.ts` | Test service delegation. |
| `src/routes/adminRoutes.ts` | Add `POST /admin/counters/:counterId/verified-count`. |
| `src/routes/adminRoutes.test.ts` | Cover success, unauthorized, invalid count, and missing counter. |
| Existing route tests | Add fake method where `AdminCountingPort` is constructed. |

## Task 1: Add failing route and service tests

**Files:**
- Modify: `src/routes/adminRoutes.test.ts`
- Modify: `src/services/counting.test.ts`

- [x] **Step 1: Extend fakes**

Add `setVerifiedCount: vi.fn()` to counting fakes.

- [x] **Step 2: Route tests**

Add tests for `POST /admin/counters/:counterId/verified-count`:

- success with admin token and `{ verifiedCount: 1500, source: 'manual_admin' }` returns `{ reconciled: true, counterId, deviceId, displayedCount }` and publishes MQTT reason `verified_count`;
- missing admin token returns `401`;
- negative count returns `400 { error: 'invalid_verified_count' }`;
- missing counter returns `404 { error: 'counter_not_found' }`.

- [x] **Step 3: Service test**

Add a counting service test that calls `setVerifiedCount` and expects delegation to the repository.

- [x] **Step 4: Run failing tests**

Run:

```bash
npm run test -- src/routes/adminRoutes.test.ts src/services/counting.test.ts
```

Expected: FAIL because `setVerifiedCount` does not exist yet.

## Task 2: Implement repository, service, and route

**Files:**
- Modify: `src/repositories/counters.ts`
- Modify: `src/services/counting.ts`
- Modify: `src/routes/adminRoutes.ts`

- [x] **Step 1: Add repository type and method**

`setVerifiedCount` should update one counter:

- `verifiedCount = input.verifiedCount`
- `optimisticDelta = 0`
- `displayedCount = input.verifiedCount`
- `updatedAt = now`

It should return `{ counterId, deviceId, displayedCount, optimisticDelta }` or `null`.

It should also insert a `count_snapshots` row with source and raw payload.

- [x] **Step 2: Add service method**

Expose `setVerifiedCount(input)` from `createCountingService`.

- [x] **Step 3: Add admin route**

Route:

```text
POST /admin/counters/:counterId/verified-count
```

Payload:

```json
{
  "verifiedCount": 1500,
  "source": "manual_admin"
}
```

Behavior:

- require admin token;
- validate count is integer `0..9999999`;
- default source to `manual_admin`;
- call service;
- return 404 if missing;
- publish MQTT set-count with reason `verified_count`;
- return `{ reconciled: true, counterId, deviceId, displayedCount }`.

- [x] **Step 4: Run tests and build**

Run:

```bash
npm run test -- src/routes/adminRoutes.test.ts src/services/counting.test.ts
npm run build
```

Expected: PASS.

## Task 3: Full verification and commit

- [x] **Step 1: Run full checks**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 2: Commit**

Run:

```bash
git add .
git commit -m "feat(live-counter): add admin verified count reconciliation"
```

## Self-Review

Spec coverage:

- Reconciliation strategy for optimistic counts: implemented by clearing optimistic delta when a verified count arrives.
- Admin pilot control: implemented behind existing admin bearer token.
- Device sync: implemented through existing MQTT set-count publisher.

Intentional gaps:

- Automated API polling will call the same service later.
