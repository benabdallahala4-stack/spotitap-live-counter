import { describe, expect, it, vi } from 'vitest';
import { createProvisioningService, type ProvisioningRepository } from './provisioning.js';

function createRepo(overrides: Partial<ProvisioningRepository> = {}): ProvisioningRepository {
  return {
    provisionCounterOrder: vi.fn().mockResolvedValue({
      customerId: 'customer-1',
      orderId: 'order-1',
      counterId: 'counter-1',
      deviceId: 'device-1',
      qrSlug: 'wc-123-instagram-1',
      qrUrl: 'http://localhost:4100/r/wc-123-instagram-1'
    }),
    ...overrides
  };
}

describe('createProvisioningService', () => {
  it('provisions a single Instagram counter order', async () => {
    const repo = createRepo();
    const service = createProvisioningService(repo, { publicBaseUrl: 'http://localhost:4100' });

    const result = await service.provisionWooOrder({
      wooOrderId: 123,
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      quantity: 1
    });

    expect(repo.provisionCounterOrder).toHaveBeenCalledWith({
      wooOrderId: '123',
      email: 'owner@example.com',
      name: 'Cafe Example',
      platform: 'instagram',
      sku: 'spotitap-live-instagram',
      index: 1,
      qrSlug: 'wc-123-instagram-1',
      publicBaseUrl: 'http://localhost:4100'
    });
    expect(result.counters).toHaveLength(1);
    expect(result.counters[0]?.qrUrl).toBe('http://localhost:4100/r/wc-123-instagram-1');
  });

  it('rejects unsupported quantities', async () => {
    const service = createProvisioningService(createRepo(), { publicBaseUrl: 'http://localhost:4100' });

    await expect(
      service.provisionWooOrder({
        wooOrderId: 123,
        email: 'owner@example.com',
        name: 'Cafe Example',
        platform: 'instagram',
        sku: 'spotitap-live-instagram',
        quantity: 0
      })
    ).rejects.toThrow(/quantity/);
  });
});
