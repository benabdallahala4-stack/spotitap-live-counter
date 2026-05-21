export type ProvisioningPlatform = 'instagram' | 'facebook' | 'tiktok';

export type WooOrderProvisionInput = {
  wooOrderId: number | string;
  email: string;
  name: string;
  platform: ProvisioningPlatform;
  sku: string;
  quantity: number;
};

export type ProvisionedCounter = {
  customerId: string;
  orderId: string;
  counterId: string;
  deviceId: string;
  qrSlug: string;
  qrUrl: string;
};

export type ProvisioningRepository = {
  provisionCounterOrder(input: {
    wooOrderId: string;
    email: string;
    name: string;
    platform: ProvisioningPlatform;
    sku: string;
    index: number;
    qrSlug: string;
    publicBaseUrl: string;
  }): Promise<ProvisionedCounter>;
};

export type ProvisioningService = ReturnType<typeof createProvisioningService>;

export function createProvisioningService(
  repo: ProvisioningRepository,
  options: { publicBaseUrl: string }
) {
  return {
    async provisionWooOrder(input: WooOrderProvisionInput): Promise<{ counters: ProvisionedCounter[] }> {
      if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 25) {
        throw new Error('quantity must be between 1 and 25');
      }

      const counters: ProvisionedCounter[] = [];
      const wooOrderId = String(input.wooOrderId);
      for (let index = 1; index <= input.quantity; index += 1) {
        const qrSlug = `wc-${wooOrderId}-${input.platform}-${index}`;
        counters.push(
          await repo.provisionCounterOrder({
            wooOrderId,
            email: input.email,
            name: input.name,
            platform: input.platform,
            sku: input.sku,
            index,
            qrSlug,
            publicBaseUrl: options.publicBaseUrl
          })
        );
      }

      return { counters };
    }
  };
}
