import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCountingService } from './counting.js';
import type { CounterRepository } from '../repositories/counters.js';

function createRepository(overrides: Partial<CounterRepository> = {}): CounterRepository {
  return {
    findQrRouteBySlug: vi.fn(),
    hasRecentScanForFingerprint: vi.fn(),
    createScanEvent: vi.fn(),
    createOptimisticEvent: vi.fn(),
    incrementCounterOptimisticDelta: vi.fn(),
    getCounterDeviceTarget: vi.fn(),
    saveCountSnapshot: vi.fn(),
    recordScanWithOptionalOptimisticIncrement: vi.fn(),
    ...overrides
  };
}

describe('createCountingService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an optimistic increment for a new qualified scan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

    const repo = createRepository({
      findQrRouteBySlug: vi.fn().mockResolvedValue({
        id: 'route-1',
        counterId: 'counter-1',
        destinationUrl: 'https://instagram.com/spotitap',
        platformDeepLink: 'instagram://user?username=spotitap'
      }),
      hasRecentScanForFingerprint: vi.fn().mockResolvedValue(false),
      createScanEvent: vi.fn().mockResolvedValue({ id: 'scan-1' }),
      createOptimisticEvent: vi.fn().mockResolvedValue({ id: 'opt-1' }),
      incrementCounterOptimisticDelta: vi.fn().mockResolvedValue({
        counterId: 'counter-1',
        deviceId: 'device-1',
        displayedCount: 1284
      }),
      recordScanWithOptionalOptimisticIncrement: vi.fn().mockResolvedValue({
        optimisticApplied: true,
        target: {
          counterId: 'counter-1',
          deviceId: 'device-1',
          displayedCount: 1284
        },
        optimisticEventId: 'opt-1'
      })
    });
    const service = createCountingService(repo, {
      optimisticTtlMinutes: 60,
      fingerprintCooldownMinutes: 120
    });

    const result = await service.recordQrScan({
      slug: 'cafe-demo',
      fingerprintHash: 'fp-1',
      ipHash: 'ip-1',
      userAgent: 'vitest'
    });

    expect(result).toEqual({
      destinationUrl: 'https://instagram.com/spotitap',
      platformDeepLink: 'instagram://user?username=spotitap',
      optimisticApplied: true,
      counterId: 'counter-1',
      deviceId: 'device-1',
      displayedCount: 1284,
      optimisticEventId: 'opt-1'
    });
    expect(repo.recordScanWithOptionalOptimisticIncrement).toHaveBeenCalledWith({
      counterId: 'counter-1',
      qrRouteId: 'route-1',
      fingerprintHash: 'fp-1',
      ipHash: 'ip-1',
      userAgent: 'vitest',
      cooldownSince: new Date('2026-05-21T10:00:00.000Z'),
      optimisticExpiresAt: new Date('2026-05-21T13:00:00.000Z'),
      optimisticAmount: 1,
      duplicateConfidenceScore: 20,
      qualifiedConfidenceScore: 85
    });
  });

  it('does not increment again during the fingerprint cooldown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

    const repo = createRepository({
      findQrRouteBySlug: vi.fn().mockResolvedValue({
        id: 'route-1',
        counterId: 'counter-1',
        destinationUrl: 'https://instagram.com/spotitap',
        platformDeepLink: 'instagram://user?username=spotitap'
      }),
      hasRecentScanForFingerprint: vi.fn().mockResolvedValue(true),
      createScanEvent: vi.fn().mockResolvedValue({ id: 'scan-1' }),
      getCounterDeviceTarget: vi.fn().mockResolvedValue({
        counterId: 'counter-1',
        deviceId: 'device-1',
        displayedCount: 1283
      }),
      recordScanWithOptionalOptimisticIncrement: vi.fn().mockResolvedValue({
        optimisticApplied: false,
        target: {
          counterId: 'counter-1',
          deviceId: 'device-1',
          displayedCount: 1283
        }
      })
    });
    const service = createCountingService(repo, {
      optimisticTtlMinutes: 60,
      fingerprintCooldownMinutes: 120
    });

    const result = await service.recordQrScan({
      slug: 'cafe-demo',
      fingerprintHash: 'fp-1',
      ipHash: 'ip-1',
      userAgent: 'vitest'
    });

    expect(result.optimisticApplied).toBe(false);
    expect(result.deviceId).toBe('device-1');
    expect(result.displayedCount).toBe(1283);
    expect(repo.recordScanWithOptionalOptimisticIncrement).toHaveBeenCalledWith({
      counterId: 'counter-1',
      qrRouteId: 'route-1',
      fingerprintHash: 'fp-1',
      ipHash: 'ip-1',
      userAgent: 'vitest',
      cooldownSince: new Date('2026-05-21T10:00:00.000Z'),
      optimisticExpiresAt: new Date('2026-05-21T13:00:00.000Z'),
      optimisticAmount: 1,
      duplicateConfidenceScore: 20,
      qualifiedConfidenceScore: 85
    });
    expect(repo.getCounterDeviceTarget).not.toHaveBeenCalled();
    expect(repo.createOptimisticEvent).not.toHaveBeenCalled();
    expect(repo.incrementCounterOptimisticDelta).not.toHaveBeenCalled();
  });
});
