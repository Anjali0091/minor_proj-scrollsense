# Full-Stack Task Board (Production Baseline)

This project includes a production-ready baseline setup:

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (persistent local file)
- Security: Helmet, rate limiting, payload limits, hidden x-powered-by
- Validation: Zod schemas for request bodies
- Logging: Morgan
- Performance: Compression enabled
- Real-time anti-doomscrolling: focus session tracking, progressive nudges, and hard-stop cooldown

## Project Structure

- frontend: React app
- backend: API server and database layer
- backend/data/tasks.sqlite: persisted task data

## Environment

Copy backend environment template:

1. Create `backend/.env` from `backend/.env.example`
2. Adjust values if needed

Default values:

- NODE_ENV=development
- PORT=5000
- CLIENT_URL=http://localhost:5173

## Local Development

Run both frontend and backend:

```bash
npm run dev
```

Or run independently:

```bash
npm run dev:backend
npm run dev:frontend
```

Mobile testing on same Wi-Fi:

```bash
npm run dev:frontend:mobile
```

## Production Run

Build frontend and start backend (backend serves the built frontend):

```bash
npm start
```

This serves:

- API on `/api/*`
- Frontend static app on `/`

## API Endpoints

- GET `/api/health`
- GET `/api/tasks`
- POST `/api/tasks`
- PATCH `/api/tasks/:id`
- DELETE `/api/tasks/:id`
- GET `/api/focus/summary`
- POST `/api/focus/session/start`
- POST `/api/focus/session/ping`
- POST `/api/focus/session/end`
- POST `/api/focus/nudge`

## Anti-Doomscroll Features

- Tracks active scrolling streaks in real time
- Fires progressive nudges at threshold levels (gentle, strong, hard-stop)
- Enforces a temporary hard-stop overlay to break long streaks
- Persists session and nudge analytics in SQLite for later review

## Browser Extension Mode (Real Sites)

This repo now includes a Chrome extension in `extension/` that runs on:

- YouTube
- X (Twitter)
- Instagram
- Reddit
- Facebook

### Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension` folder from this project

### Configure Extension

1. Open extension details and click **Extension options**
2. Keep API base URL as `http://localhost:5000` (or change to your deployed API)
3. Set nudge thresholds and cooldown duration
4. Optional: configure allow-list and block-list domains (comma separated)

Allow/block rules:

- `allow-list` empty: extension runs on all supported sites
- `allow-list` set: extension runs only on listed domains/subdomains
- `block-list`: always excluded, even if present in allow-list

### Run with Backend

Start backend before browsing distracting feeds:

```bash
npm run dev:backend
```

When you scroll continuously on supported sites, the extension will:

- start a focus session
- send real-time activity pings
- show progressive nudges
- trigger a hard-stop overlay
- persist analytics to your backend database

## Deployment Notes

- Set `NODE_ENV=production` in your deployment environment.
- Keep `CLIENT_URL` aligned with your frontend domain if hosting frontend separately.
- For single-server deploys, use `npm start` at repository root.
- Persist `backend/data` as a volume if deploying in containers.
