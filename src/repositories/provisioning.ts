import crypto from 'node:crypto';
import type { DbClient } from '../db/client.js';
import { counters, customers, devices, orders, qrRoutes } from '../db/schema.js';
import type {
  ProvisionedCounter,
  ProvisioningPlatform,
  ProvisioningRepository
} from '../services/provisioning.js';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function pendingDestinationUrl(qrSlug: string): string {
  const url = new URL('https://spotitap.com/live-counter/setup');
  url.searchParams.set('counter', qrSlug);
  return url.toString();
}

function pendingDeepLink(platform: ProvisioningPlatform, qrSlug: string): string {
  return `spotitap-live://${platform}/pending/${encodeURIComponent(qrSlug)}`;
}

export function createProvisioningRepository(db: DbClient): ProvisioningRepository {
  return {
    async provisionCounterOrder(input): Promise<ProvisionedCounter> {
      return db.transaction(async (tx) => {
        const [customer] = await tx
          .insert(customers)
          .values({
            email: input.email,
            name: input.name,
            phone: ''
          })
          .onConflictDoUpdate({
            target: customers.email,
            set: {
              name: input.name
            }
          })
          .returning({ id: customers.id });
        if (!customer) {
          throw new Error('Failed to provision customer');
        }

        const [order] = await tx
          .insert(orders)
          .values({
            customerId: customer.id,
            wooOrderId: input.wooOrderId,
            status: 'provisioned'
          })
          .onConflictDoUpdate({
            target: orders.wooOrderId,
            set: {
              customerId: customer.id,
              status: 'provisioned'
            }
          })
          .returning({ id: orders.id });
        if (!order) {
          throw new Error('Failed to provision order');
        }

        const pendingSerial = `PENDING-${input.wooOrderId}-${input.index}`;
        const [device] = await tx
          .insert(devices)
          .values({
            serial: pendingSerial,
            claimCodeHash: sha256(`claim:${pendingSerial}`),
            mqttUsername: `pending-${input.wooOrderId}-${input.index}`,
            mqttPasswordHash: sha256(`mqtt:${pendingSerial}`),
            status: 'manufactured'
          })
          .onConflictDoUpdate({
            target: devices.serial,
            set: {
              status: 'manufactured'
            }
          })
          .returning({ id: devices.id });
        if (!device) {
          throw new Error('Failed to provision device');
        }

        const [counter] = await tx
          .insert(counters)
          .values({
            customerId: customer.id,
            deviceId: device.id,
            platform: input.platform,
            label: `${input.name} ${titleCase(input.platform)} Counter`,
            slug: input.qrSlug,
            verifiedCount: 0,
            optimisticDelta: 0,
            displayedCount: 0,
            status: 'reserved'
          })
          .onConflictDoUpdate({
            target: counters.slug,
            set: {
              customerId: customer.id,
              deviceId: device.id,
              platform: input.platform,
              label: `${input.name} ${titleCase(input.platform)} Counter`,
              updatedAt: new Date()
            }
          })
          .returning({ id: counters.id });
        if (!counter) {
          throw new Error('Failed to provision counter');
        }

        await tx
          .insert(qrRoutes)
          .values({
            counterId: counter.id,
            slug: input.qrSlug,
            destinationUrl: pendingDestinationUrl(input.qrSlug),
            platformDeepLink: pendingDeepLink(input.platform, input.qrSlug)
          })
          .onConflictDoUpdate({
            target: qrRoutes.slug,
            set: {
              counterId: counter.id,
              destinationUrl: pendingDestinationUrl(input.qrSlug),
              platformDeepLink: pendingDeepLink(input.platform, input.qrSlug)
            }
          });

        return {
          customerId: customer.id,
          orderId: order.id,
          counterId: counter.id,
          deviceId: device.id,
          qrSlug: input.qrSlug,
          qrUrl: `${input.publicBaseUrl}/r/${input.qrSlug}`
        };
      });
    }
  };
}
