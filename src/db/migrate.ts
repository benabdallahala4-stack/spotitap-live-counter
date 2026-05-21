import 'dotenv/config';
import { createPool } from './client.js';
import { readConfig } from '../config.js';

const ddl = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE counter_platform AS ENUM ('instagram', 'facebook', 'tiktok');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE device_status AS ENUM ('manufactured', 'claimed', 'online', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE counter_status AS ENUM ('reserved', 'active', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE optimistic_status AS ENUM ('active', 'confirmed', 'expired', 'reconciled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  woo_order_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'provisioned',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial text NOT NULL UNIQUE,
  claim_code_hash text NOT NULL,
  mqtt_username text NOT NULL,
  mqtt_password_hash text NOT NULL,
  status device_status NOT NULL DEFAULT 'manufactured',
  firmware_version text NOT NULL DEFAULT 'unknown',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  device_id uuid NOT NULL REFERENCES devices(id),
  platform counter_platform NOT NULL,
  label text NOT NULL,
  slug text NOT NULL UNIQUE,
  verified_count integer NOT NULL DEFAULT 0,
  optimistic_delta integer NOT NULL DEFAULT 0,
  displayed_count integer NOT NULL DEFAULT 0,
  status counter_status NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_id uuid NOT NULL REFERENCES counters(id),
  slug text NOT NULL UNIQUE,
  destination_url text NOT NULL,
  platform_deep_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_id uuid NOT NULL REFERENCES counters(id),
  qr_route_id uuid NOT NULL REFERENCES qr_routes(id),
  fingerprint_hash text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  ip_hash text NOT NULL DEFAULT '',
  confidence_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS optimistic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_id uuid NOT NULL REFERENCES counters(id),
  scan_event_id uuid NOT NULL REFERENCES scan_events(id),
  amount integer NOT NULL DEFAULT 1,
  status optimistic_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS count_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_id uuid NOT NULL REFERENCES counters(id),
  source text NOT NULL,
  verified_count integer NOT NULL,
  displayed_count integer NOT NULL,
  optimistic_delta integer NOT NULL,
  raw_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

async function main() {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  await pool.query(ddl);
  await pool.end();
  console.log('Live Counter database schema is ready.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
