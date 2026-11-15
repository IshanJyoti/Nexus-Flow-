# NexusFlow: Visual IoT Telemetry & Rule Engine

Draw IoT rules on a canvas (Sensor → Moving Average → Threshold → SMS Alert). The Node.js backend compiles the graph into live RxJS streams and evaluates them against telemetry stored in MongoDB Time-Series collections.

## Run it

Requires Node 18+ and MongoDB 5.0+ (`docker compose up -d` starts MongoDB 7).

```bash
npm run install:all
npm run dev:server      # API + WebSocket on :5000
npm run dev:client      # UI on http://localhost:5173
```

1. Open http://localhost:5173 and create an account.
2. **Rule Builder** → *Example* → **Deploy**.
3. **Live Dashboard** → **Start simulator**. Wires glow, nodes show live values, alerts appear.
4. Production: `npm run build` then `npm start` (the server serves `client/dist`).

Other commands: `npm test` (compiler unit tests), `npm run loadtest -- --rate 5000 --seconds 20` (ingestion audit).

## Architecture

```
React Flow canvas ──save/deploy──▶ Express API ──▶ Stream Compiler (RxJS)
                                        ▲                │ Observables per node
Devices ──POST /api/ingest | WS────▶ Ingestion buffer ──┴──▶ rule engine ──▶ SMS / Webhook
                                        │ batched insertMany
                                        ▼
                         MongoDB time-series collection `telemetry`
Live dashboard ◀── WebSocket (/ws): telemetry, node activity, alerts, stats
```

## Ingestion API

```bash
curl -X POST localhost:5000/api/ingest -H 'Content-Type: application/json' \
  -d '[{"deviceId":"turbine-1","metric":"temperature","value":91.2},
       {"deviceId":"turbine-2","readings":{"temperature":70.1,"rpm":3010}}]'
```
WebSocket devices connect to `/ws?device=1` (or `?key=INGEST_KEY`) and send `{"type":"telemetry","data":[...]}`. Set `INGEST_KEY` in `server/.env` to require `x-api-key`.

## Feature checklist (vs. the project brief)

| Brief requirement | Where |
|---|---|
| **Visual Graph Builder** (React + React Flow), drag-and-drop, non-technical users | `client/src/pages/Builder.jsx`: palette, canvas, minimap, inspector, cycle-proof wiring |
| Node library: Data Sources, Math Operations, Action Triggers | `client/src/nodeDefs.js`: Sensor, Moving Average, Math, Threshold, Logic Gate (AND/OR), Cooldown, SMS Alert, Webhook |
| **Graph serialization** to valid JSON | Builder → **JSON** tab (live view), Export/Import `.json`, server-side validation |
| **Time-Series DB** (MongoDB 5.0+), high-ingest, append-only | `server/src/models.js` creates a native time-series collection (`timeField`, `metaField`, retention TTL) |
| **Ingestion API** (Express + WebSockets), 5,000 writes/sec | `server/src/ingest.js`: in-memory buffer, batched unordered `insertMany`; `scripts/loadtest.js`; live "Writes / sec" + storage footprint cards |
| **Stream Compiler** (Node + RxJS): JSON graph → Observables | `server/src/compiler.js`: validate, topological build, shared streams, moving average via `scan`, AND via `combineLatest` |
| **Live rule execution**: WebSocket telemetry through compiled pipelines, in memory | `server/src/engine.js` + `ingest.js` feed one `Subject`; rules deploy/undeploy/hot-reload without restart; active rules resume on boot |
| **Live dashboards** (Recharts) subscribing to WebSocket | `client/src/pages/Dashboard.jsx` |
| **Webhooks & alerting** (external API / mock SMS) | `server/src/actions.js`: templated messages, 5 s timeout, per-node cooldown, persisted alert log; `Alerts` page + toasts |
| **Visual feedback**: wires glow when data passes | Server coalesces node activity → `fires` messages → glowing edges, pulsing nodes, live value badges |
| Factory manager login | JWT auth (register/login), per-user rules |
| Extras | Validation panel, example rule, simulator, device registry, dirty-state tracking, unit tests |

## Demo script for the reviews

- **Mid-project review**: run `npm run loadtest -- --rate 5000`, show *Writes / sec* and *Storage footprint / bytes per point* on the dashboard (or `GET /api/stats`). Show the **JSON** tab and the *Export* file for graph serialization.
- **Final review**: deploy the example, start the simulator, watch an overheating burst light up the wires and fire SMS + webhook; edit the threshold and press *Save* to hot-reload the live rule.

## Notes

- SMS is mocked (logged + stored). Replace the `console.log` in `server/src/actions.js` with Twilio or MSG91.
- The webhook example points at `https://httpbin.org/post`; use your own endpoint in production.
- Change `JWT_SECRET` before deploying.
