import 'dotenv/config';
import crypto from 'node:crypto';
import { readConfig } from '../config.js';
import { createPool } from './client.js';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);

  try {
    const customer = await pool.query<{ id: string }>(
      `INSERT INTO customers (email, name, phone)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['pilot@spotitap.com', 'Spotitap Pilot Cafe', '']
    );

    const device = await pool.query<{ id: string }>(
      `INSERT INTO devices (serial, claim_code_hash, mqtt_username, mqtt_password_hash, status)
       VALUES ($1, $2, $3, $4, 'claimed')
       ON CONFLICT (serial) DO UPDATE SET status = 'claimed'
       RETURNING id`,
      ['SP-LIVE-DEV-0001', sha256('CLAIM-0001'), 'device-dev-0001', sha256('dev-password')]
    );

    const counter = await pool.query<{ id: string }>(
      `INSERT INTO counters (customer_id, device_id, platform, label, slug, verified_count, optimistic_delta, displayed_count, status)
       VALUES ($1, $2, 'instagram', 'Pilot Instagram Counter', 'pilot-instagram', 1283, 0, 1283, 'active')
       ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label
       RETURNING id`,
      [customer.rows[0].id, device.rows[0].id]
    );

    await pool.query(
      `INSERT INTO qr_routes (counter_id, slug, destination_url, platform_deep_link)
       VALUES ($1, 'pilot-instagram', 'https://instagram.com/spotitap', 'instagram://user?username=spotitap')
       ON CONFLICT (slug) DO UPDATE SET destination_url = EXCLUDED.destination_url`,
      [counter.rows[0].id]
    );
  } finally {
    await pool.end();
  }

  console.log('Seeded prototype counter at /r/pilot-instagram');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
