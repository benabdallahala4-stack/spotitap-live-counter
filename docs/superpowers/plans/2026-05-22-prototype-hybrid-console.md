# Prototype Hybrid Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight hybrid web console for internal/provider hardware prototype testing.

**Architecture:** Serve a static HTML/CSS/JS console from Fastify at `/prototype-console`. Add one admin-token-protected read endpoint to list counters/devices, then reuse existing admin command endpoints for test and verified count sends. Keep command history client-side for the first version.

**Tech Stack:** TypeScript, Fastify, Drizzle/Postgres, Zod, plain HTML/CSS/JavaScript, Vitest.

---

## File Map

| File | Responsibility |
|---|---|
| `src/repositories/counters.ts` | Add `listPrototypeTargets()` repository method for UI target selection. |
| `src/services/counting.ts` | Expose `listPrototypeTargets()` through the counting service. |
| `src/routes/adminRoutes.ts` | Add `GET /admin/prototype-targets` behind existing admin token. |
| `src/routes/adminRoutes.test.ts` | Cover list endpoint success and unauthorized behavior. |
| `src/routes/*.test.ts` | Add fake method where `AdminCountingPort` is constructed. |
| `src/routes/consoleRoutes.ts` | Serve static console assets. |
| `src/prototype-console/index.html` | Hybrid console UI and browser-side behavior. |
| `src/server.ts` | Register console route. |

## Task 1: Add Prototype Target Read API

**Files:**
- Modify: `src/repositories/counters.ts`
- Modify: `src/services/counting.ts`
- Modify: `src/routes/adminRoutes.ts`
- Modify: `src/routes/adminRoutes.test.ts`
- Modify: route tests that construct `AdminCountingPort`

- [x] **Step 1: Add route tests**

Add tests for `GET /admin/prototype-targets`:

- success with admin token returns target list from `counting.listPrototypeTargets()`;
- missing token returns `401`;
- counting fake includes `listPrototypeTargets: vi.fn()`.

- [x] **Step 2: Run failing tests**

Run:

```bash
npm run test -- src/routes/adminRoutes.test.ts
```

Expected: FAIL because the route and service method do not exist yet.

- [x] **Step 3: Add repository and service method**

Add a `PrototypeTarget` type and `listPrototypeTargets()` method. Query counters joined to devices and return:

- counterId
- label
- platform
- status
- verifiedCount
- optimisticDelta
- displayedCount
- deviceId
- deviceSerial
- deviceStatus

Expose the same method from `createCountingService`.

- [x] **Step 4: Add admin route**

Add `GET /admin/prototype-targets` to `src/routes/adminRoutes.ts`. It must require the existing admin token and return:

```json
{
  "targets": []
}
```

- [x] **Step 5: Run tests and build**

Run:

```bash
npm run test -- src/routes/adminRoutes.test.ts
npm run build
```

Expected: PASS.

## Task 2: Serve The Hybrid Console

**Files:**
- Create: `src/routes/consoleRoutes.ts`
- Create: `src/prototype-console/index.html`
- Modify: `src/server.ts`
- Test: `src/routes/consoleRoutes.test.ts`

- [x] **Step 1: Add console route test**

Create a test that requests `/prototype-console` and expects:

- HTTP 200
- `content-type` includes `text/html`
- body includes `Spotitap Prototype Console`
- body includes `/admin/prototype-targets`

- [x] **Step 2: Run failing test**

Run:

```bash
npm run test -- src/routes/consoleRoutes.test.ts
```

Expected: FAIL because the route does not exist.

- [x] **Step 3: Create console route**

Create `registerConsoleRoutes(app)` that reads `src/prototype-console/index.html` using `fs/promises`, returns it as `text/html`, and responds at:

```text
GET /prototype-console
```

- [x] **Step 4: Register route**

Register `registerConsoleRoutes(app)` from `src/server.ts`.

- [x] **Step 5: Create console HTML**

Build a self-contained HTML file with:

- left target list
- internal/provider/protocol tabs
- admin token input stored in localStorage
- target count input
- mode selector for test count vs verified count
- payload preview
- recent client-side command history
- provider protocol checklist
- clear success/error states

- [x] **Step 6: Run tests and build**

Run:

```bash
npm run test -- src/routes/consoleRoutes.test.ts src/routes/adminRoutes.test.ts
npm run build
```

Expected: PASS.

## Task 3: Full Verification

- [x] **Step 1: Run full tests**

Run:

```bash
npm run test
```

Expected: PASS.

- [x] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [x] **Step 3: Start local backend**

Run:

```bash
npm run dev
```

Expected: backend listens on configured port and `/prototype-console` loads.

## Self-Review

Spec coverage:

- Hybrid internal/provider console: Task 2.
- Device/counter selector: Task 1 and Task 2.
- Existing command endpoints reused: Task 2.
- Provider protocol reference: Task 2.
- Error/success states: Task 2.

Intentional first-version gap:

- Real device acknowledgements are not implemented because the backend has no inbound acknowledgement route yet.
