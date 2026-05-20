import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { counters, countSnapshots, optimisticEvents, qrRoutes, scanEvents } from '../db/schema.js';

export type QrRouteRecord = {
  id: string;
  counterId: string;
  destinationUrl: string;
  platformDeepLink: string;
};

export type CounterDeviceTarget = {
  counterId: string;
  deviceId: string;
  displayedCount: number;
};

export type CounterRepository = {
  findQrRouteBySlug(slug: string): Promise<QrRouteRecord | null>;
  hasRecentScanForFingerprint(input: {
    counterId: string;
    fingerprintHash: string;
    since: Date;
  }): Promise<boolean>;
  createScanEvent(input: {
    counterId: string;
    qrRouteId: string;
    fingerprintHash: string;
    ipHash: string;
    userAgent: string;
    confidenceScore: number;
  }): Promise<{ id: string }>;
  createOptimisticEvent(input: {
    counterId: string;
    scanEventId: string;
    amount: number;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  incrementCounterOptimisticDelta(input: {
    counterId: string;
    amount: number;
  }): Promise<CounterDeviceTarget>;
  getCounterDeviceTarget(counterId: string): Promise<CounterDeviceTarget | null>;
  saveCountSnapshot(input: {
    counterId: string;
    source: string;
    verifiedCount: number;
    displayedCount: number;
    optimisticDelta: number;
    rawPayload: Record<string, unknown>;
  }): Promise<void>;
};

export function createCounterRepository(db: DbClient): CounterRepository {
  return {
    async findQrRouteBySlug(slug) {
      const [route] = await db
        .select({
          id: qrRoutes.id,
          counterId: qrRoutes.counterId,
          destinationUrl: qrRoutes.destinationUrl,
          platformDeepLink: qrRoutes.platformDeepLink
        })
        .from(qrRoutes)
        .where(eq(qrRoutes.slug, slug))
        .limit(1);

      return route ?? null;
    },

    async hasRecentScanForFingerprint(input) {
      const [scan] = await db
        .select({ id: scanEvents.id })
        .from(scanEvents)
        .where(
          and(
            eq(scanEvents.counterId, input.counterId),
            eq(scanEvents.fingerprintHash, input.fingerprintHash),
            gt(scanEvents.createdAt, input.since)
          )
        )
        .orderBy(desc(scanEvents.createdAt))
        .limit(1);

      return Boolean(scan);
    },

    async createScanEvent(input) {
      const [scan] = await db.insert(scanEvents).values(input).returning({ id: scanEvents.id });
      if (!scan) {
        throw new Error('Failed to create scan event');
      }

      return scan;
    },

    async createOptimisticEvent(input) {
      const [event] = await db
        .insert(optimisticEvents)
        .values({
          counterId: input.counterId,
          scanEventId: input.scanEventId,
          amount: input.amount,
          expiresAt: input.expiresAt
        })
        .returning({ id: optimisticEvents.id });
      if (!event) {
        throw new Error('Failed to create optimistic event');
      }

      return event;
    },

    async incrementCounterOptimisticDelta(input) {
      const [updated] = await db
        .update(counters)
        .set({
          optimisticDelta: sql`${counters.optimisticDelta} + ${input.amount}`,
          displayedCount: sql`${counters.displayedCount} + ${input.amount}`,
          updatedAt: new Date()
        })
        .where(eq(counters.id, input.counterId))
        .returning({
          counterId: counters.id,
          deviceId: counters.deviceId,
          displayedCount: counters.displayedCount
        });
      if (!updated) {
        throw new Error(`Counter not found: ${input.counterId}`);
      }

      return updated;
    },

    async getCounterDeviceTarget(counterId) {
      const [counter] = await db
        .select({
          counterId: counters.id,
          deviceId: counters.deviceId,
          displayedCount: counters.displayedCount
        })
        .from(counters)
        .where(eq(counters.id, counterId))
        .limit(1);

      return counter ?? null;
    },

    async saveCountSnapshot(input) {
      await db.insert(countSnapshots).values(input);
    }
  };
}
