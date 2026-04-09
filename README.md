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
- Detects prolonged scrolling sessions, repeated reopen patterns, and late-night usage
- Fires progressive micro-nudges at threshold levels (gentle, strong, reflection)
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

1. Start backend and frontend (`npm run dev`)
2. Open frontend app (`http://localhost:5173`)
3. Fill login, required details, and blocked domains
4. Click **Activate Protection**
5. Reload open social tabs so extension applies the latest setup and starts detection

Extension Options now acts as a lightweight status/sync page only.

## Python Prototype Modules

A lightweight Python prototype is available in `python_prototype/` with:

- synthetic smartphone usage log generation
- behavior detection algorithms
- nudge classification engine
- console workflow
- Tkinter desktop UI
- static HTML dashboard generation

See `python_prototype/README.md` for setup and run commands.

Allow/block rules:

- `allow-list` empty: extension runs on all supported sites
- `allow-list` set: extension runs only on listed domains/subdomains
- `block-list`: fully blocked with an overlay on matching domains

## Frontend-Based Activation (No Manual Extension Form Needed)

You can now complete setup from the web frontend instead of the extension options page.

1. Start backend and frontend (`npm run dev` from root, or run each separately)
2. Open the frontend app in browser (default `http://localhost:5173`)
3. Fill:
	- login email + password
	- required profile details
	- blocked domains
4. Click **Activate Protection**
5. Reload any open social-feed tabs

The extension auto-syncs setup from backend (`GET /api/extension/setup`) and applies blocking/nudge settings automatically.

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
