import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { devices } from '../db/schema.js';
import type { DeviceAdminPort, RegisteredDevice } from '../routes/deviceAdminRoutes.js';

export function createDeviceAdminRepository(db: DbClient): DeviceAdminPort {
  return {
    async registerDevice(input): Promise<RegisteredDevice> {
      const [device] = await db
        .insert(devices)
        .values({
          serial: input.serial,
          claimCodeHash: input.claimCodeHash,
          mqttUsername: input.mqttUsername,
          mqttPasswordHash: input.mqttPasswordHash,
          status: 'manufactured'
        })
        .onConflictDoUpdate({
          target: devices.serial,
          set: {
            claimCodeHash: input.claimCodeHash,
            mqttUsername: input.mqttUsername,
            mqttPasswordHash: input.mqttPasswordHash,
            status: 'manufactured'
          }
        })
        .returning({
          id: devices.id,
          serial: devices.serial,
          status: devices.status
        });
      if (!device) {
        throw new Error('Failed to register device');
      }

      return device;
    }
  };
}

export async function findDeviceBySerial(db: DbClient, serial: string): Promise<RegisteredDevice | null> {
  const [device] = await db
    .select({
      id: devices.id,
      serial: devices.serial,
      status: devices.status
    })
    .from(devices)
    .where(eq(devices.serial, serial))
    .limit(1);

  return device ?? null;
}
