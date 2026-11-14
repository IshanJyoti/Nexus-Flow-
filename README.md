# NexusFlow — Week 1 starter

A beginner-friendly React + React Flow + Express + MongoDB Atlas + Socket.IO starter for the NexusFlow IoT telemetry project.

## Included in this starter

- Express API with health check and telemetry endpoints
- MongoDB native Time-Series collection creation (`telemetry`)
- Single-reading and batch ingestion APIs
- Socket.IO broadcasts for live readings
- React Flow canvas with Sensor, Moving Average, and Alert nodes
- Dashboard cards, recent readings, and a basic >80°C alert monitor

> Week 1 scope: this is a working foundation. The graph is currently a visual draft; Week 2 will add graph serialization and the RxJS compiler. The moving average shown on the dashboard is a preview, not yet a compiled graph operation. SMS is not sent in this starter.

## Requirements

- Node.js 20 LTS or newer
- VS Code
- MongoDB Atlas account and a database user
- Git (optional)

Check Node and npm in PowerShell:

```powershell
node -v
npm -v
```

## 1. Configure MongoDB Atlas

1. Create a free Atlas cluster.
2. In **Database Access**, create a database user and save its username/password.
3. In **Network Access**, add your current IP address for development.
4. Open **Connect → Drivers**, choose Node.js, and copy the connection string.
5. Replace `<username>`, `<password>`, and `<cluster-url>` in the connection string. If your password has special characters, URL-encode them.

Do not share your connection string or commit it to Git.

## 2. Configure the backend environment

In PowerShell, from the NexusFlow root:

```powershell
Copy-Item .env.example server/.env
```

Open `server/.env` and set `MONGODB_URI` to your real Atlas URI. Keep `DB_NAME=nexusflow`.

The backend creates a MongoDB Time-Series collection named `telemetry` on first startup. It uses `timestamp` as the time field and `metadata` as the meta field. It also configures 30-day automatic expiry for this development demo; change or remove `expireAfterSeconds` if your project needs longer retention.

## 3. Install dependencies

From the root folder:

```powershell
npm install
npm run install:all
```

## 4. Run the app

From the root folder:

```powershell
npm run dev
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:5000/api/health

Keep this terminal open. Stop both services with `Ctrl+C`.

### Preview the frontend without a backend

To see the dashboard without setting up MongoDB or starting the API, run this from the project root:

```powershell
npm run demo
```

Open http://localhost:5173. Demo mode uses sample telemetry readings and does not connect to the backend or database.

## 5. Send a test telemetry point

Open a second PowerShell terminal:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:5000/api/telemetry `
  -ContentType "application/json" `
  -Body '{"sensorId":"TURBINE-01","temperature":76.5}'
```

Send an alert-threshold reading:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:5000/api/telemetry `
  -ContentType "application/json" `
  -Body '{"sensorId":"TURBINE-01","temperature":86.2}'
```

The dashboard should update without refreshing. A reading above 80°C appears in the alert monitor.

## 6. Send a batch

```powershell
$body = @{
  readings = @(
    @{ sensorId = "TURBINE-01"; temperature = 72.4 },
    @{ sensorId = "TURBINE-01"; temperature = 78.1 },
    @{ sensorId = "TURBINE-01"; temperature = 83.7 }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri http://localhost:5000/api/telemetry/batch `
  -ContentType "application/json" `
  -Body $body
```

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check API status |
| POST | `/api/telemetry` | Insert one reading |
| POST | `/api/telemetry/batch` | Insert 1–1000 readings |
| GET | `/api/telemetry/latest?limit=50` | Fetch recent readings |

Single-reading JSON:

```json
{
  "sensorId": "TURBINE-01",
  "temperature": 76.5,
  "unit": "C",
  "deviceType": "turbine"
}
```

## Troubleshooting

- **MongoServerSelectionError:** Check Atlas Network Access, cluster status, URI, username, and password.
- **Authentication failed:** Recheck the database user credentials; they are different from your Atlas website login.
- **Frontend says API offline:** Make sure the backend terminal is running on port 5000.
- **Port already in use:** Stop the other process or change `PORT` in `server/.env`.
- **Time-Series collection already exists:** The startup code detects and reuses it. If you created a normal collection named `telemetry` earlier, drop it in the Atlas UI only if it contains no data you need, then restart.

## Week 1 completion checks

- [ ] Atlas connection succeeds
- [ ] Time-Series `telemetry` collection exists
- [ ] Health endpoint returns `status: ok`
- [ ] Single and batch readings are inserted
- [ ] React Flow canvas loads and nodes can be connected
- [ ] Dashboard receives live Socket.IO telemetry
- [ ] A reading above 80°C produces an alert indicator

## Important performance note

Do not claim 5,000 writes/second based on this starter. That target needs a controlled load test, appropriate Atlas tier, indexes/schema tuning, batched writes, and measured results. Establish a baseline first, then optimize and document the actual throughput.
