const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')

const dataDir = path.resolve(__dirname, '../data')
const dbPath = path.join(dataDir, 'tasks.sqlite')

let db

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const initDb = async () => {
  if (db) {
    return db
  }

  ensureDataDir()
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      status TEXT NOT NULL,
      activeSeconds INTEGER NOT NULL DEFAULT 0,
      scrollEvents INTEGER NOT NULL DEFAULT 0,
      endReason TEXT,
      updatedAt TEXT NOT NULL
    );
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS focus_nudges (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      elapsedSeconds INTEGER NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(sessionId) REFERENCES focus_sessions(id)
    );
  `)

  const row = await db.get('SELECT COUNT(*) AS count FROM tasks')
  if (!row || row.count === 0) {
    const now = new Date().toISOString()
    await db.run(
      'INSERT INTO tasks (id, title, completed, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), 'Connect React UI with Express API', 1, now, now],
    )
    await db.run(
      'INSERT INTO tasks (id, title, completed, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), 'Deploy this app to production', 0, now, now],
    )
  }

  return db
}

const toTask = (row) => ({
  id: row.id,
  title: row.title,
  completed: Boolean(row.completed),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const listTasks = async () => {
  const rows = await db.all('SELECT * FROM tasks ORDER BY createdAt DESC')
  return rows.map(toTask)
}

const getTaskById = async (id) => {
  const row = await db.get('SELECT * FROM tasks WHERE id = ?', [id])
  return row ? toTask(row) : null
}

const createTask = async (title) => {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  await db.run(
    'INSERT INTO tasks (id, title, completed, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    [id, title, 0, now, now],
  )

  return getTaskById(id)
}

const updateTask = async (id, patch) => {
  const existing = await getTaskById(id)
  if (!existing) {
    return null
  }

  const next = {
    title: patch.title ?? existing.title,
    completed: patch.completed ?? existing.completed,
  }

  await db.run(
    'UPDATE tasks SET title = ?, completed = ?, updatedAt = ? WHERE id = ?',
    [next.title, next.completed ? 1 : 0, new Date().toISOString(), id],
  )

  return getTaskById(id)
}

const deleteTask = async (id) => {
  await db.run('DELETE FROM tasks WHERE id = ?', [id])
}

const toFocusSession = (row) => ({
  id: row.id,
  source: row.source,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  status: row.status,
  activeSeconds: row.activeSeconds,
  scrollEvents: row.scrollEvents,
  endReason: row.endReason,
  updatedAt: row.updatedAt,
})

const startFocusSession = async (source) => {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.run(
    'INSERT INTO focus_sessions (id, source, startedAt, status, activeSeconds, scrollEvents, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, source, now, 'active', 0, 0, now],
  )

  return getFocusSessionById(id)
}

const getFocusSessionById = async (id) => {
  const row = await db.get('SELECT * FROM focus_sessions WHERE id = ?', [id])
  return row ? toFocusSession(row) : null
}

const pingFocusSession = async (id, patch) => {
  const current = await getFocusSessionById(id)
  if (!current || current.status !== 'active') {
    return null
  }

  await db.run(
    'UPDATE focus_sessions SET activeSeconds = activeSeconds + ?, scrollEvents = scrollEvents + ?, updatedAt = ? WHERE id = ?',
    [patch.activeSeconds, patch.scrollEvents, new Date().toISOString(), id],
  )

  return getFocusSessionById(id)
}

const endFocusSession = async (id, endReason) => {
  const current = await getFocusSessionById(id)
  if (!current || current.status !== 'active') {
    return null
  }

  await db.run(
    'UPDATE focus_sessions SET status = ?, endReason = ?, endedAt = ?, updatedAt = ? WHERE id = ?',
    ['ended', endReason, new Date().toISOString(), new Date().toISOString(), id],
  )

  return getFocusSessionById(id)
}

const createFocusNudge = async (payload) => {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.run(
    'INSERT INTO focus_nudges (id, sessionId, level, message, elapsedSeconds, accepted, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      payload.sessionId,
      payload.level,
      payload.message,
      payload.elapsedSeconds,
      payload.accepted ? 1 : 0,
      now,
    ],
  )

  return {
    id,
    ...payload,
    createdAt: now,
  }
}

const getFocusSummary = async () => {
  const totals = await db.get(
    `SELECT
      COUNT(*) AS sessionCount,
      COALESCE(SUM(activeSeconds), 0) AS activeSeconds,
      COALESCE(SUM(scrollEvents), 0) AS scrollEvents
     FROM focus_sessions`,
  )

  const nudgeTotals = await db.get(
    `SELECT
      COALESCE(SUM(CASE WHEN level = 'gentle' THEN 1 ELSE 0 END), 0) AS gentle,
      COALESCE(SUM(CASE WHEN level = 'strong' THEN 1 ELSE 0 END), 0) AS strong,
      COALESCE(SUM(CASE WHEN level = 'hard-stop' THEN 1 ELSE 0 END), 0) AS hardStop
     FROM focus_nudges`,
  )

  const latestSession = await db.get(
    'SELECT * FROM focus_sessions ORDER BY startedAt DESC LIMIT 1',
  )

  return {
    sessionCount: totals.sessionCount,
    activeSeconds: totals.activeSeconds,
    scrollEvents: totals.scrollEvents,
    nudgeCounts: {
      gentle: nudgeTotals.gentle,
      strong: nudgeTotals.strong,
      hardStop: nudgeTotals.hardStop,
    },
    latestSession: latestSession ? toFocusSession(latestSession) : null,
  }
}

module.exports = {
  initDb,
  listTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  startFocusSession,
  getFocusSessionById,
  pingFocusSession,
  endFocusSession,
  createFocusNudge,
  getFocusSummary,
}
