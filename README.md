# FloodWatch

College flood-monitoring project. React + TypeScript + Vite frontend and ASP.NET Core (.NET 10) API. Physical hardware validation is still required.

## Public student review

- Website: https://floodwatch-monitoring.vercel.app/
- Source: https://github.com/gervie1234/floodwatch-monitoring
- Device tutorial: https://floodwatch-monitoring.vercel.app/downloads/FloodWatch-Device-Tutorial.pdf

The production frontend works independently of the local API so students can review the interface on Vercel. A single **Sample readings** indicator identifies generated observations; it never claims a device is connected. History filters, charts, CSV export, alert history, read-only station configuration and the illustrated build guide are available. Public users cannot edit station settings or send device telemetry through this static site.

The Vercel project uses the repository root and `vercel.json`; it installs/builds `frontend` and serves `frontend/dist`. The build copies only the component photos and FloodWatch device tutorial into public assets. ASP.NET Core is retained as the actual device API source, not represented as running on Vercel. Connecting real devices requires a separate compatible API host and durable storage.

To connect a future deployed API, configure `VITE_API_BASE_URL` at frontend build time and enable appropriate API HTTPS, authentication and CORS. No device key belongs in a Vite environment variable. Local `pnpm dev` still uses the Vite proxy and local ASP.NET Core API.

## Run locally

Terminal 1, repository root:

```powershell
dotnet run --project backend/FloodWatch.Api.csproj
```

Terminal 2:

```powershell
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5186. The API defaults to http://127.0.0.1:5086. Vite proxies `/api` to it. Both default to loopback. Demo readings are generated separately and never saved as device measurements. Turn off Demo mode to see only actual ingested readings.

## Device tutorial

Read `output/pdf/FloodWatch_Device_Build_Tutorial.pdf`. Open `firmware/FloodWatch/FloodWatch.ino` in Arduino IDE. Copy `config.example.h` to `config.h` and set the actual Wi-Fi, API address, API key, height and thresholds. Keep `config.h` private. Install **esp32 by Espressif Systems** and **TinyGPSPlus by Mikal Hart**. The starter targets a classic ESP32-WROOM DevKit, with a pulse-mode JSN-SR04T, verified GPS supply, and the protected wiring described in the tutorial. It has not been compiled with the ESP32 toolchain or tested on hardware here.

For an ESP32 on the same trusted private Wi-Fi, deliberately enable LAN access in the API terminal:

```powershell
$env:FLOODWATCH_URL = 'http://0.0.0.0:5086'
$env:DEVICE_API_KEY = '<choose-a-long-random-key>'
dotnet run --project backend/FloodWatch.Api.csproj
```

Find the computer's private IPv4 address using `ipconfig`. Set firmware `API_URL` to `http://<computer-ip>:5086/api/readings`, and set `DEVICE_KEY` to the same key. Use only the private network, permit TCP 5086 only on that network if Windows prompts, and never port-forward it. HTTP is a supervised LAN prototype choice, not a public deployment. Settings writes remain limited to loopback; there are no user accounts. To return to loopback, remove these environment variables and restart.

## API

- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings`: local requests only, validates increasing thresholds and clearance.
- `GET /api/readings?demo=true`: synthetic 24-hour sample.
- `GET /api/readings?demo=false`: stored device data.
- `POST /api/readings`: `X-Device-Key` header required. Ingestion is disabled until `DEVICE_API_KEY` is set.

Example JSON (use the actual current UTC observation time):

```json
{"deviceId":"FW-001","bootId":"unique-per-restart","sequence":1,"observedAtUtc":"2026-10-22T07:00:00Z","distanceCm":90,"latitude":null,"longitude":null}
```

The API calculates water level from configured height minus distance. Duplicate device/boot/sequence combinations do not add a record. Valid distance is 30 cm to the configured mounting height; timestamps must be within the past seven days and at most one minute ahead. Invalid sensor observations are not sent by the starter, so the device connection becomes stale after 30 seconds. Coordinates are nullable when GPS has no recent fix. Battery percentage is intentionally absent because no battery telemetry circuit exists.

## Data and limits

Local records and settings are atomically saved under `backend/Data/` (ignored by Git). Up to 10,000 readings are retained; this is bounded prototype storage, not an archival database. Back up that folder if needed. Existing readings retain original level values; historical badges and threshold events are recalculated using current dashboard thresholds. Alerts are UI state transitions, not a certified notification or acknowledgement system. Frontend refresh is polling every 10 seconds, not SignalR.

Firmware sampling/local warning logic is independent of its network task. Starter firmware makes one HTTP attempt per queued observation; it does not persist/replay offline data. GPS baud, trigger timing and minimum clearance must match the actual hardware. ESP32 and dashboard thresholds must be updated separately. NTP synchronization is required before telemetry is sent; local alarms still work without it. Solar charger and power-bank compatibility require real testing.

## Validation

```powershell
dotnet build backend/FloodWatch.Api.csproj
cd frontend
pnpm build
```

Browser checks cover overview, history filters, alerts, settings and responsive layout. Device behavior and real peer networking remain separate hardware tests. Tutorial and firmware describe the intended bench workflow, not completed device validation.

`python tests/published_site.py` checks anonymous public access, the deployed JavaScript against the local build, the tutorial PDF, all eight component images and repository visibility. It makes read-only public requests without account credentials.
