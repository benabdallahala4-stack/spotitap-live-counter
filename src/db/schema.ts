import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const counterPlatform = pgEnum('counter_platform', ['instagram', 'facebook', 'tiktok']);
export const deviceStatus = pgEnum('device_status', ['manufactured', 'claimed', 'online', 'offline']);
export const counterStatus = pgEnum('counter_status', ['reserved', 'active', 'paused']);
export const optimisticStatus = pgEnum('optimistic_status', ['active', 'confirmed', 'expired', 'reconciled']);

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  serial: text('serial').notNull().unique(),
  claimCodeHash: text('claim_code_hash').notNull(),
  mqttUsername: text('mqtt_username').notNull(),
  mqttPasswordHash: text('mqtt_password_hash').notNull(),
  status: deviceStatus('status').notNull().default('manufactured'),
  firmwareVersion: text('firmware_version').notNull().default('unknown'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const counters = pgTable('counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  deviceId: uuid('device_id').notNull().references(() => devices.id),
  platform: counterPlatform('platform').notNull(),
  label: text('label').notNull(),
  slug: text('slug').notNull().unique(),
  verifiedCount: integer('verified_count').notNull().default(0),
  optimisticDelta: integer('optimistic_delta').notNull().default(0),
  displayedCount: integer('displayed_count').notNull().default(0),
  status: counterStatus('status').notNull().default('reserved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const qrRoutes = pgTable('qr_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  counterId: uuid('counter_id').notNull().references(() => counters.id),
  slug: text('slug').notNull().unique(),
  destinationUrl: text('destination_url').notNull(),
  platformDeepLink: text('platform_deep_link').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const scanEvents = pgTable('scan_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  counterId: uuid('counter_id').notNull().references(() => counters.id),
  qrRouteId: uuid('qr_route_id').notNull().references(() => qrRoutes.id),
  fingerprintHash: text('fingerprint_hash').notNull(),
  userAgent: text('user_agent').notNull().default(''),
  ipHash: text('ip_hash').notNull().default(''),
  confidenceScore: integer('confidence_score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const optimisticEvents = pgTable('optimistic_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  counterId: uuid('counter_id').notNull().references(() => counters.id),
  scanEventId: uuid('scan_event_id').notNull().references(() => scanEvents.id),
  amount: integer('amount').notNull().default(1),
  status: optimisticStatus('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const countSnapshots = pgTable('count_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  counterId: uuid('counter_id').notNull().references(() => counters.id),
  source: text('source').notNull(),
  verifiedCount: integer('verified_count').notNull(),
  displayedCount: integer('displayed_count').notNull(),
  optimisticDelta: integer('optimistic_delta').notNull(),
  rawPayload: jsonb('raw_payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const deviceEvents = pgTable('device_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').notNull().references(() => devices.id),
  type: text('type').notNull(),
  payload: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
