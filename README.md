# Spotitap Live Counter Prototype

This is the first standalone Live Counter backend slice. It proves:

- QR scan logging
- optimistic counter increments
- MQTT `set-count` command publishing
- admin test-count command publishing

## Local run

```bash
cd /home/ala/gitlab/spotitap-live-counter
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- `http://localhost:4100/health`
- `http://localhost:4100/r/pilot-instagram`

Admin test command:

```bash
COUNTER_ID="$(docker exec spotitap-live-counter-postgres-1 psql -U spotitap_live -d spotitap_live -Atc "select id from counters where slug='pilot-instagram'")"
curl -X POST "http://localhost:4100/admin/counters/${COUNTER_ID}/test-count" \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer replace-with-at-least-24-random-chars' \
  -d '{"target":1300}'
```

The prototype MQTT topic is:

```text
devices/{deviceId}/commands/set-count
```
