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

      const scanResult = await repo.recordScanWithOptionalOptimisticIncrement({
        counterId: route.counterId,
        qrRouteId: route.id,
        fingerprintHash: input.fingerprintHash,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
        cooldownSince: new Date(Date.now() - options.fingerprintCooldownMinutes * 60_000),
        optimisticExpiresAt: new Date(Date.now() + options.optimisticTtlMinutes * 60_000),
        optimisticAmount: 1,
        duplicateConfidenceScore: 20,
        qualifiedConfidenceScore: 85
      });

      return {
        destinationUrl: route.destinationUrl,
        platformDeepLink: route.platformDeepLink,
        optimisticApplied: scanResult.optimisticApplied,
        counterId: route.counterId,
        deviceId: scanResult.target?.deviceId,
        displayedCount: scanResult.target?.displayedCount,
        optimisticEventId: scanResult.optimisticEventId
      };
    },

    async getCounterDeviceTarget(counterId: string) {
      return repo.getCounterDeviceTarget(counterId);
    }
  };
}
