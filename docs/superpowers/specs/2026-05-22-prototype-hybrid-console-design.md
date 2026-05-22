# Prototype Hybrid Console Design

## Goal

Build a small web console for testing the Spotitap live counter backend with prototype hardware. The console should serve two audiences:

- Internal Spotitap testing, where we need enough visibility to debug backend-to-device behavior.
- Provider testing, where the manufacturer needs a clean, limited interface to send commands and verify the firmware/device response.

The first version focuses on sending count updates to a real prototype device through the existing backend. It is not a full customer dashboard, mobile provisioning app, or production operations console.

## Users

### Internal user

Needs to select a known counter/device, send test or verified counts, confirm what payload was sent, and inspect recent results while debugging backend/device integration.

### Provider user

Needs a simple page with connection details, safe test controls, and protocol documentation. The provider should not need to understand the full backend or database model.

## Scope

### Included

- A browser-based prototype console served by the existing Fastify backend.
- A simple navigation model with:
  - Internal mode
  - Provider mode
  - Protocol reference
- A device/counter selector using backend data.
- A count command form:
  - target count
  - command mode: admin test count or verified count reconciliation
- A payload preview showing:
  - MQTT topic: `devices/{deviceId}/commands/set-count`
  - JSON payload shape
- A recent command/history panel.
- Provider instructions covering:
  - MQTT connection expectations
  - topic format
  - payload fields
  - expected device behavior
- Basic error and success states.

### Excluded From First Version

- Mobile app provisioning.
- Captive portal or Bluetooth WiFi onboarding.
- Real MQTT device acknowledgements, unless already available from the backend.
- User account management.
- Customer-facing styling or billing/admin workflows.
- Automated social media API polling.

## User Experience

The console opens directly into the testing surface, not a landing page.

Layout:

- Left panel: device and counter list.
- Main panel: selected target, count form, send button, payload preview.
- Right panel: status, recent commands, provider checklist.
- Protocol tab/page: concise integration reference the provider can follow.

Provider mode hides internal-only details and emphasizes:

- device ID
- MQTT topic
- sample payload
- test count sender
- expected firmware behavior

## Backend Integration

The console should reuse existing backend behavior:

- `POST /admin/counters/:counterId/test-count`
- `POST /admin/counters/:counterId/verified-count`

The first version may need a small read endpoint to list testable counters/devices for the UI. If added, it should be admin-token protected and return only the fields needed by the console:

- counter ID
- counter label/platform
- device ID
- device serial/status if available
- current displayed/verified count if available

## Security

The console is a prototype/admin tool. It should require the existing admin token for command actions.

For provider testing, we can either:

- share a temporary admin token in a controlled prototype environment, or
- add a narrower provider test token later.

The first implementation should keep the surface local/prototype-friendly and avoid pretending this is a hardened production admin portal.

## Error Handling

The UI should show clear messages for:

- missing/invalid admin token
- invalid target count
- missing counter
- backend publish failure
- network/server failure

Errors should include enough detail for prototype debugging without exposing secrets.

## Testing

Add focused coverage for any new backend read endpoint.

For the frontend:

- verify the static UI renders
- verify payload preview generation
- verify command submission calls the correct endpoint
- verify error messages for common failure states

Manual verification should include running the backend locally and sending both a test count and verified count to the MQTT broker.

## Open Decisions

- Whether provider mode uses the same admin token or a separate provider test token.
- Whether command history is stored persistently or shown only from in-memory/client-side submission results in the first version.
- Whether to serve the frontend from the backend process or use a separate dev frontend app.

Recommendation for first build: serve a lightweight static frontend from Fastify to keep the prototype easy to run and share.
