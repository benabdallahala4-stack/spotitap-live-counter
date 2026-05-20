import type { CounterRepository } from '../repositories/counters.js';

export type CountingOptions = {
  optimisticTtlMinutes: number;
  fingerprintCooldownMinutes: number;
};

export type QrScanInput = {
  slug: string;
  fingerprintHash: string;
  ipHash: string;
  userAgent: string;
};

export type QrScanResult = {
  destinationUrl: string;
  platformDeepLink: string;
  optimisticApplied: boolean;
  counterId: string;
  deviceId?: string;
  displayedCount?: number;
  optimisticEventId?: string;
};

export function createCountingService(repo: CounterRepository, options: CountingOptions) {
  return {
    async recordQrScan(input: QrScanInput): Promise<QrScanResult> {
      const route = await repo.findQrRouteBySlug(input.slug);
      if (!route) {
        throw new Error(`QR route not found: ${input.slug}`);
      }

      const cooldownSince = new Date(Date.now() - options.fingerprintCooldownMinutes * 60_000);
      const duplicate = await repo.hasRecentScanForFingerprint({
        counterId: route.counterId,
        fingerprintHash: input.fingerprintHash,
        since: cooldownSince
      });

      const scan = await repo.createScanEvent({
        counterId: route.counterId,
        qrRouteId: route.id,
        fingerprintHash: input.fingerprintHash,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
        confidenceScore: duplicate ? 20 : 85
      });

      if (duplicate) {
        const target = await repo.getCounterDeviceTarget(route.counterId);

        return {
          destinationUrl: route.destinationUrl,
          platformDeepLink: route.platformDeepLink,
          optimisticApplied: false,
          counterId: route.counterId,
          deviceId: target?.deviceId,
          displayedCount: target?.displayedCount
        };
      }

      const expiresAt = new Date(Date.now() + options.optimisticTtlMinutes * 60_000);
      const optimistic = await repo.createOptimisticEvent({
        counterId: route.counterId,
        scanEventId: scan.id,
        amount: 1,
        expiresAt
      });
      const target = await repo.incrementCounterOptimisticDelta({
        counterId: route.counterId,
        amount: 1
      });

      return {
        destinationUrl: route.destinationUrl,
        platformDeepLink: route.platformDeepLink,
        optimisticApplied: true,
        counterId: route.counterId,
        deviceId: target.deviceId,
        displayedCount: target.displayedCount,
        optimisticEventId: optimistic.id
      };
    }
  };
}
