require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const { z } = require('zod')
const {
  initDb,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskById,
  startFocusSession,
  getFocusSessionById,
  pingFocusSession,
  endFocusSession,
  createFocusNudge,
  getFocusSummary,
  getExtensionSetup,
  saveExtensionSetup,
  getAuthUserByEmail,
  createAuthUser,
} = require('./taskDb')
const crypto = require('node:crypto')

const app = express()
const PORT = Number(process.env.PORT || 5000)
const NODE_ENV = process.env.NODE_ENV || 'development'
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
const CLIENT_URLS = (process.env.CLIENT_URLS || CLIENT_URL)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const isProduction = NODE_ENV === 'production'
const staticDistPath = path.resolve(__dirname, '../../frontend/dist')

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
)
app.use(compression())
app.use(morgan(isProduction ? 'combined' : 'dev'))
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 250 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
  }),
)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }

      if (!isProduction) {
        callback(null, true)
        return
      }

      if (CLIENT_URLS.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin not allowed by CORS'))
    },
  }),
)
app.use(express.json({ limit: '100kb' }))

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
})

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

const startFocusSessionSchema = z.object({
  source: z.string().trim().min(1).max(80).default('feed'),
})

const pingFocusSessionSchema = z.object({
  sessionId: z.string().uuid(),
  activeSeconds: z.number().int().min(0).max(30),
  scrollEvents: z.number().int().min(0).max(200),
})

const endFocusSessionSchema = z.object({
  sessionId: z.string().uuid(),
  endReason: z.string().trim().min(1).max(120).default('user_end'),
})

const createFocusNudgeSchema = z.object({
  sessionId: z.string().uuid(),
  level: z.enum(['gentle', 'strong', 'hard-stop']),
  message: z.string().trim().min(1).max(220),
  elapsedSeconds: z.number().int().min(0),
  accepted: z.boolean().default(false),
})

const authSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(6).max(120),
})

const hashPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex')

app.post('/api/auth/signup', async (request, response, next) => {
  try {
    const payload = authSchema.parse(request.body)
    const passwordHash = hashPassword(payload.password)
    const created = await createAuthUser(payload.email, passwordHash)

    if (!created) {
      return response.status(409).json({ message: 'Email already registered. Please login.' })
    }

    return response.status(201).json({
      ok: true,
      email: created.email,
      mode: 'signup',
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const payload = authSchema.parse(request.body)
    const user = await getAuthUserByEmail(payload.email)

    if (!user) {
      return response.status(404).json({ message: 'Account not found. Please sign up first.' })
    }

    if (user.passwordHash !== hashPassword(payload.password)) {
      return response.status(401).json({ message: 'Incorrect password.' })
    }

    return response.json({
      ok: true,
      email: user.email,
      mode: 'login',
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/auth/lookup', async (request, response, next) => {
  try {
    const email = String(request.query.email || '').trim().toLowerCase()

    if (!email) {
      return response.status(400).json({ message: 'Email is required.' })
    }

    const user = await getAuthUserByEmail(email)
    return response.json({ exists: Boolean(user), email })
  } catch (error) {
    return next(error)
  }
})

const extensionSetupSchema = z.object({
  loginEmail: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(120),
  dailyGoalMinutes: z.number().int().min(15).max(600),
  focusReason: z.string().trim().min(1).max(300),
  monitorDomains: z.array(z.string().trim().min(1)).max(100).default([]),
  allowDomains: z.array(z.string().trim().min(1)).max(100).default([]),
  gentleSeconds: z.number().int().min(10).max(3600).default(10),
  strongSeconds: z.number().int().min(20).max(3600).default(20),
  hardStopSeconds: z.number().int().min(30).max(3600).default(30),
  cooldownSeconds: z.number().int().min(5).max(3600).default(20),
  apiBase: z.string().trim().url().default('http://localhost:5000'),
})

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', environment: NODE_ENV })
})

app.get('/api/tasks', async (_request, response, next) => {
  try {
    const tasks = await listTasks()
    response.json(tasks)
  } catch (error) {
    next(error)
  }
})

app.post('/api/tasks', async (request, response, next) => {
  try {
    const payload = createTaskSchema.parse(request.body)
    const task = await createTask(payload.title)
    response.status(201).json(task)
  } catch (error) {
    next(error)
  }
})

app.patch('/api/tasks/:id', async (request, response, next) => {
  try {
    const payload = updateTaskSchema.parse(request.body)
    const task = await updateTask(request.params.id, payload)

    if (!task) {
      return response.status(404).json({ message: 'Task not found' })
    }

    return response.json(task)
  } catch (error) {
    return next(error)
  }
})

app.delete('/api/tasks/:id', async (request, response, next) => {
  try {
    const exists = await getTaskById(request.params.id)

    if (!exists) {
      return response.status(404).json({ message: 'Task not found' })
    }

    await deleteTask(request.params.id)
    return response.status(204).send()
  } catch (error) {
    return next(error)
  }
})

app.get('/api/focus/summary', async (_request, response, next) => {
  try {
    const summary = await getFocusSummary()
    response.json(summary)
  } catch (error) {
    next(error)
  }
})

app.post('/api/focus/session/start', async (request, response, next) => {
  try {
    const payload = startFocusSessionSchema.parse(request.body || {})
    const session = await startFocusSession(payload.source)
    response.status(201).json(session)
  } catch (error) {
    next(error)
  }
})

app.post('/api/focus/session/ping', async (request, response, next) => {
  try {
    const payload = pingFocusSessionSchema.parse(request.body)
    const session = await pingFocusSession(payload.sessionId, {
      activeSeconds: payload.activeSeconds,
      scrollEvents: payload.scrollEvents,
    })

    if (!session) {
      return response.status(404).json({ message: 'Active session not found' })
    }

    return response.json(session)
  } catch (error) {
    return next(error)
  }
})

app.post('/api/focus/session/end', async (request, response, next) => {
  try {
    const payload = endFocusSessionSchema.parse(request.body)
    const session = await endFocusSession(payload.sessionId, payload.endReason)

    if (!session) {
      return response.status(404).json({ message: 'Active session not found' })
    }

    return response.json(session)
  } catch (error) {
    return next(error)
  }
})

app.post('/api/focus/nudge', async (request, response, next) => {
  try {
    const payload = createFocusNudgeSchema.parse(request.body)
    const session = await getFocusSessionById(payload.sessionId)

    if (!session) {
      return response.status(404).json({ message: 'Session not found' })
    }

    const nudge = await createFocusNudge(payload)
    response.status(201).json(nudge)
  } catch (error) {
    next(error)
  }
})

app.get('/api/extension/setup', async (_request, response, next) => {
  try {
    const setup = await getExtensionSetup()
    response.json(setup)
  } catch (error) {
    next(error)
  }
})

app.post('/api/extension/setup', async (request, response, next) => {
  try {
    const payload = extensionSetupSchema.parse(request.body)
    const normalizedMonitorDomains = payload.monitorDomains.map((value) =>
      value.trim().toLowerCase().replace(/^\./, ''),
    )
    const normalizedAllowDomains = payload.allowDomains.map((value) =>
      value.trim().toLowerCase().replace(/^\./, ''),
    )

    const normalized = {
      enabled: true,
      setupComplete: true,
      isLoggedIn: true,
      loginEmail: payload.loginEmail.toLowerCase(),
      fullName: payload.fullName,
      dailyGoalMinutes: payload.dailyGoalMinutes,
      focusReason: payload.focusReason,
      monitorDomains: normalizedMonitorDomains,
      // Keep compatibility with existing extension settings key.
      blockDomains: [],
      allowDomains: normalizedAllowDomains.length > 0 ? normalizedAllowDomains : normalizedMonitorDomains,
      gentleSeconds: payload.gentleSeconds,
      strongSeconds: payload.strongSeconds,
      hardStopSeconds: payload.hardStopSeconds,
      cooldownSeconds: payload.cooldownSeconds,
      apiBase: payload.apiBase,
    }

    const saved = await saveExtensionSetup(normalized)
    response.status(201).json(saved)
  } catch (error) {
    next(error)
  }
})

app.post('/api/extension/deactivate', async (_request, response, next) => {
  try {
    const existing = await getExtensionSetup()

    if (!existing?.config) {
      return response.status(404).json({ message: 'No setup found to deactivate.' })
    }

    const normalized = {
      ...existing.config,
      enabled: false,
      setupComplete: false,
    }

    const saved = await saveExtensionSetup(normalized)
    return response.json(saved)
  } catch (error) {
    return next(error)
  }
})

if (fs.existsSync(staticDistPath)) {
  app.use(express.static(staticDistPath))

  app.use((request, response, next) => {
    if (request.path.startsWith('/api')) {
      return next()
    }

    return response.sendFile(path.join(staticDistPath, 'index.html'))
  })
} else {
  app.get('/', (_request, response) => {
    response.json({
      message: 'Backend is running',
      routes: ['/api/health', '/api/tasks'],
    })
  })
}

app.use((error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({
      message: 'Validation failed',
      issues: error.issues.map((issue) => issue.message),
    })
  }

  console.error(error)
  return response.status(500).json({ message: 'Internal server error' })
})

const startServer = async () => {
  await initDb()
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
