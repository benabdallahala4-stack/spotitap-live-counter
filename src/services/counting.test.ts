import { describe, expect, it, vi } from 'vitest';
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
    ...overrides
  };
}

describe('createCountingService', () => {
  it('creates an optimistic increment for a new qualified scan', async () => {
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
  });

  it('does not increment again during the fingerprint cooldown', async () => {
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
    expect(repo.getCounterDeviceTarget).toHaveBeenCalledWith('counter-1');
    expect(repo.createOptimisticEvent).not.toHaveBeenCalled();
    expect(repo.incrementCounterOptimisticDelta).not.toHaveBeenCalled();
  });
});
