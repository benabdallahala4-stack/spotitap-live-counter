# Next.js Prototype Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the prototype console experience into a React/Next.js app while keeping the Fastify backend as the API/device layer.

**Architecture:** Add `apps/console` as a Next.js app that calls the existing Fastify endpoints over HTTP. The backend remains responsible for PostgreSQL, MQTT publishing, admin auth, and hardware-facing behavior. The Next.js app owns UI state, provider/internal tabs, payload preview, and command submission.

**Tech Stack:** Next.js, React, TypeScript, CSS, Fastify API, PostgreSQL, MQTT.

---

## Task 1: Scaffold Next.js Console App

**Files:**
- Modify: `package.json`
- Create: `apps/console/package.json`
- Create: `apps/console/next.config.mjs`
- Create: `apps/console/tsconfig.json`
- Create: `apps/console/next-env.d.ts`

- [x] Add Next.js scripts at the repo root: `console:dev`, `console:build`, `console:start`.
- [x] Add dependencies: `next`, `react`, `react-dom`.
- [x] Add dev dependencies: `@types/react`, `@types/react-dom`.
- [x] Create the minimal Next.js app config under `apps/console`.

## Task 2: Build React Console UI

**Files:**
- Create: `apps/console/app/layout.tsx`
- Create: `apps/console/app/page.tsx`
- Create: `apps/console/app/globals.css`

- [x] Implement the hybrid internal/provider/protocol UI in React.
- [x] Use `NEXT_PUBLIC_API_BASE_URL` when provided; otherwise default API calls to `http://127.0.0.1:4100`.
- [x] Store the admin token and command history in browser `localStorage`.
- [x] Call:
  - `GET /admin/prototype-targets`
  - `POST /admin/counters/:counterId/test-count`
  - `POST /admin/counters/:counterId/verified-count`
- [x] Keep provider mode limited to test-count commands.

## Task 3: Verification

- [x] Run `npm install` if dependencies are missing.
- [x] Run `npm run console:build`.
- [x] Run `npm run test`.
- [x] Run `npm run build`.
- [x] Start the Next.js dev server and provide the local URL.

## Notes

- The existing Fastify-served static console can remain during this transition; the Next.js console is the new target frontend.
- Do not expose MQTT credentials in the frontend. The frontend only calls the backend API.
