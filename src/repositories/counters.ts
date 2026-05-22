import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { counters, countSnapshots, devices, optimisticEvents, qrRoutes, scanEvents } from '../db/schema.js';

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

export type SetVerifiedCountInput = {
  counterId: string;
  verifiedCount: number;
  source: string;
  rawPayload: Record<string, unknown>;
};

export type SetVerifiedCountResult = {
  counterId: string;
  deviceId: string;
  displayedCount: number;
  optimisticDelta: number;
};

export type PrototypeTarget = {
  counterId: string;
  label: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  status: 'reserved' | 'active' | 'paused';
  verifiedCount: number;
  optimisticDelta: number;
  displayedCount: number;
  deviceId: string;
  deviceSerial: string;
  deviceStatus: 'manufactured' | 'claimed' | 'online' | 'offline';
};

export type RecordScanWithOptionalOptimisticIncrementInput = {
  counterId: string;
  qrRouteId: string;
  fingerprintHash: string;
  ipHash: string;
  userAgent: string;
  cooldownSince: Date;
  optimisticExpiresAt: Date;
  optimisticAmount: number;
  duplicateConfidenceScore: number;
  qualifiedConfidenceScore: number;
};

export type RecordScanWithOptionalOptimisticIncrementResult = {
  optimisticApplied: boolean;
  target: CounterDeviceTarget | null;
  optimisticEventId?: string;
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
  configureCounterSocialTarget(
    input: ConfigureCounterSocialTargetInput
  ): Promise<ConfigureCounterSocialTargetResult | null>;
  setVerifiedCount(input: SetVerifiedCountInput): Promise<SetVerifiedCountResult | null>;
  listPrototypeTargets(): Promise<PrototypeTarget[]>;
  recordScanWithOptionalOptimisticIncrement(
    input: RecordScanWithOptionalOptimisticIncrementInput
  ): Promise<RecordScanWithOptionalOptimisticIncrementResult>;
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
    },

    async configureCounterSocialTarget(input) {
      return db.transaction(async (tx) => {
        const [counter] = await tx
          .update(counters)
          .set({
            status: 'active',
            updatedAt: new Date()
          })
          .where(eq(counters.id, input.counterId))
          .returning({ id: counters.id });
        if (!counter) {
          return null;
        }

        const [route] = await tx
          .update(qrRoutes)
          .set({
            destinationUrl: input.destinationUrl,
            platformDeepLink: input.platformDeepLink
          })
          .where(eq(qrRoutes.counterId, input.counterId))
          .returning({
            counterId: qrRoutes.counterId,
            destinationUrl: qrRoutes.destinationUrl,
            platformDeepLink: qrRoutes.platformDeepLink
          });
        if (!route) {
          return null;
        }

        return route;
      });
    },

    async setVerifiedCount(input) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(counters)
          .set({
            verifiedCount: input.verifiedCount,
            optimisticDelta: 0,
            displayedCount: input.verifiedCount,
            updatedAt: new Date()
          })
          .where(eq(counters.id, input.counterId))
          .returning({
            counterId: counters.id,
            deviceId: counters.deviceId,
            displayedCount: counters.displayedCount,
            optimisticDelta: counters.optimisticDelta
          });
        if (!updated) {
          return null;
        }

        await tx.insert(countSnapshots).values({
          counterId: input.counterId,
          source: input.source,
          verifiedCount: input.verifiedCount,
          displayedCount: input.verifiedCount,
          optimisticDelta: 0,
          rawPayload: input.rawPayload
        });

        return updated;
      });
    },

    async listPrototypeTargets() {
      return db
        .select({
          counterId: counters.id,
          label: counters.label,
          platform: counters.platform,
          status: counters.status,
          verifiedCount: counters.verifiedCount,
          optimisticDelta: counters.optimisticDelta,
          displayedCount: counters.displayedCount,
          deviceId: devices.id,
          deviceSerial: devices.serial,
          deviceStatus: devices.status
        })
        .from(counters)
        .innerJoin(devices, eq(counters.deviceId, devices.id))
        .orderBy(counters.label);
    },

    async recordScanWithOptionalOptimisticIncrement(input) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.counterId}), hashtext(${input.fingerprintHash}))`
        );

        const [recentScan] = await tx
          .select({ id: scanEvents.id })
          .from(scanEvents)
          .where(
            and(
              eq(scanEvents.counterId, input.counterId),
              eq(scanEvents.fingerprintHash, input.fingerprintHash),
              gt(scanEvents.createdAt, input.cooldownSince)
            )
          )
          .orderBy(desc(scanEvents.createdAt))
          .limit(1);
        const duplicate = Boolean(recentScan);

        const [scan] = await tx
          .insert(scanEvents)
          .values({
            counterId: input.counterId,
            qrRouteId: input.qrRouteId,
            fingerprintHash: input.fingerprintHash,
            ipHash: input.ipHash,
            userAgent: input.userAgent,
            confidenceScore: duplicate
              ? input.duplicateConfidenceScore
              : input.qualifiedConfidenceScore
          })
          .returning({ id: scanEvents.id });
        if (!scan) {
          throw new Error('Failed to create scan event');
        }

        if (duplicate) {
          const [target] = await tx
            .select({
              counterId: counters.id,
              deviceId: counters.deviceId,
              displayedCount: counters.displayedCount
            })
            .from(counters)
            .where(eq(counters.id, input.counterId))
            .limit(1);

          return {
            optimisticApplied: false,
            target: target ?? null
          };
        }

        const [event] = await tx
          .insert(optimisticEvents)
          .values({
            counterId: input.counterId,
            scanEventId: scan.id,
            amount: input.optimisticAmount,
            expiresAt: input.optimisticExpiresAt
          })
          .returning({ id: optimisticEvents.id });
        if (!event) {
          throw new Error('Failed to create optimistic event');
        }

        const [target] = await tx
          .update(counters)
          .set({
            optimisticDelta: sql`${counters.optimisticDelta} + ${input.optimisticAmount}`,
            displayedCount: sql`${counters.displayedCount} + ${input.optimisticAmount}`,
            updatedAt: new Date()
          })
          .where(eq(counters.id, input.counterId))
          .returning({
            counterId: counters.id,
            deviceId: counters.deviceId,
            displayedCount: counters.displayedCount
          });
        if (!target) {
          throw new Error(`Counter not found: ${input.counterId}`);
        }

        return {
          optimisticApplied: true,
          target,
          optimisticEventId: event.id
        };
      });
    }
  };
}
