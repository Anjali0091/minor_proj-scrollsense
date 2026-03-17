import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import './App.css'

const NUDGE_STEPS = [
  {
    level: 'gentle',
    seconds: 10,
    title: 'Quick check-in',
    message: 'You have been scrolling for a while. Want to switch to one planned task?',
  },
  {
    level: 'strong',
    seconds: 20,
    title: 'Refocus alert',
    message: 'This pattern looks like doomscrolling. Pause now and pick one action you control.',
  },
  {
    level: 'hard-stop',
    seconds: 30,
    title: 'Hard stop activated',
    message: 'Scrolling is temporarily blocked for a short reset window.',
  },
]

const FEED_ITEMS = Array.from({ length: 40 }).map((_, index) => ({
  id: `feed-${index + 1}`,
  title: `Distraction Card ${index + 1}`,
  detail:
    'If this were your social feed, this card would keep pulling attention. The nudge engine watches long streaks and interrupts them.',
}))

function App() {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [focusSummary, setFocusSummary] = useState(null)
  const [focusSessionId, setFocusSessionId] = useState('')
  const [liveActiveSeconds, setLiveActiveSeconds] = useState(0)
  const [liveScrollEvents, setLiveScrollEvents] = useState(0)
  const [nudge, setNudge] = useState(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const triggeredNudgesRef = useRef(new Set())
  const pendingActiveSecondsRef = useRef(0)
  const pendingScrollEventsRef = useRef(0)
  const lastScrollAtRef = useRef(0)

  const blocked = cooldownSeconds > 0

  const totalMinutes = useMemo(
    () => Math.floor(liveActiveSeconds / 60),
    [liveActiveSeconds],
  )

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/tasks')
      setTasks(response.data)
      setError('')
    } catch {
      setError('Could not load tasks. Check that backend is running on port 5000.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchFocusSummary = async () => {
    try {
      const response = await axios.get('/api/focus/summary')
      setFocusSummary(response.data)
    } catch {
      setError('Could not load focus analytics.')
    }
  }

  useEffect(() => {
    fetchFocusSummary()
  }, [])

  useEffect(() => {
    const startSession = async () => {
      try {
        const response = await axios.post('/api/focus/session/start', {
          source: 'simulated_feed',
        })
        setFocusSessionId(response.data.id)
      } catch {
        setError('Could not start focus session.')
      }
    }

    startSession()
  }, [])

  useEffect(() => {
    if (!focusSessionId) {
      return undefined
    }

    const pingInterval = setInterval(async () => {
      const activeSeconds = pendingActiveSecondsRef.current
      const scrollEvents = pendingScrollEventsRef.current

      if (activeSeconds === 0 && scrollEvents === 0) {
        return
      }

      pendingActiveSecondsRef.current = 0
      pendingScrollEventsRef.current = 0

      try {
        await axios.post('/api/focus/session/ping', {
          sessionId: focusSessionId,
          activeSeconds,
          scrollEvents,
        })
      } catch {
        setError('Could not sync focus session.')
      }
    }, 5000)

    const activityInterval = setInterval(() => {
      if (Date.now() - lastScrollAtRef.current < 2000) {
        pendingActiveSecondsRef.current += 1
        setLiveActiveSeconds((previous) => previous + 1)
      }
    }, 1000)

    const endSession = () => {
      const payload = JSON.stringify({
        sessionId: focusSessionId,
        endReason: 'page_leave',
      })

      navigator.sendBeacon('/api/focus/session/end', payload)
    }

    window.addEventListener('beforeunload', endSession)

    return () => {
      clearInterval(pingInterval)
      clearInterval(activityInterval)
      window.removeEventListener('beforeunload', endSession)
      axios.post('/api/focus/session/end', {
        sessionId: focusSessionId,
        endReason: 'component_unmount',
      })
    }
  }, [focusSessionId])

  useEffect(() => {
    NUDGE_STEPS.forEach((step) => {
      if (
        liveActiveSeconds >= step.seconds &&
        !triggeredNudgesRef.current.has(step.level)
      ) {
        triggeredNudgesRef.current.add(step.level)
        setNudge(step)

        if (step.level === 'hard-stop') {
          setCooldownSeconds(20)
        }

        if (focusSessionId) {
          axios.post('/api/focus/nudge', {
            sessionId: focusSessionId,
            level: step.level,
            message: step.message,
            elapsedSeconds: liveActiveSeconds,
            accepted: false,
          })
        }
      }
    })
  }, [focusSessionId, liveActiveSeconds])

  useEffect(() => {
    if (!blocked) {
      document.body.style.overflow = ''
      return undefined
    }

    document.body.style.overflow = 'hidden'
    const interval = setInterval(() => {
      setCooldownSeconds((previous) => {
        if (previous <= 1) {
          clearInterval(interval)
          return 0
        }

        return previous - 1
      })
    }, 1000)

    return () => {
      clearInterval(interval)
      document.body.style.overflow = ''
    }
  }, [blocked])

  const registerScrollEvent = () => {
    if (blocked) {
      return
    }

    lastScrollAtRef.current = Date.now()
    pendingScrollEventsRef.current += 1
    setLiveScrollEvents((previous) => previous + 1)
  }

  const dismissNudge = async () => {
    if (nudge && focusSessionId) {
      try {
        await axios.post('/api/focus/nudge', {
          sessionId: focusSessionId,
          level: nudge.level,
          message: `${nudge.message} (acknowledged)`,
          elapsedSeconds: liveActiveSeconds,
          accepted: true,
        })
      } catch {
        setError('Could not save nudge acknowledgement.')
      }
    }

    setNudge(null)
  }

  const addTask = async (event) => {
    event.preventDefault()
    if (!newTask.trim()) {
      return
    }

    try {
      const response = await axios.post('/api/tasks', { title: newTask.trim() })
      setTasks((previousTasks) => [response.data, ...previousTasks])
      setNewTask('')
    } catch {
      setError('Could not add task right now.')
    }
  }

  const toggleTask = async (task) => {
    try {
      const response = await axios.patch(`/api/tasks/${task.id}`, {
        completed: !task.completed,
      })

      setTasks((previousTasks) =>
        previousTasks.map((currentTask) =>
          currentTask.id === task.id ? response.data : currentTask,
        ),
      )
    } catch {
      setError('Could not update task state.')
    }
  }

  const deleteTask = async (id) => {
    try {
      await axios.delete(`/api/tasks/${id}`)
      setTasks((previousTasks) =>
        previousTasks.filter((currentTask) => currentTask.id !== id),
      )
    } catch {
      setError('Could not delete task right now.')
    }
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Live Anti-Doomscroll Mode</p>
        <h1>Real-time nudge dashboard</h1>
        <p className="subtitle">
          The app tracks active scrolling streaks, nudges you at thresholds, and enforces a short hard-stop cooldown.
        </p>

        <div className="stats-grid">
          <article>
            <h2>{totalMinutes}m</h2>
            <p>Current active scroll time</p>
          </article>
          <article>
            <h2>{liveScrollEvents}</h2>
            <p>Current session scroll events</p>
          </article>
          <article>
            <h2>{focusSummary?.sessionCount ?? 0}</h2>
            <p>Total tracked sessions</p>
          </article>
          <article>
            <h2>{focusSummary?.nudgeCounts?.hardStop ?? 0}</h2>
            <p>Hard stops triggered</p>
          </article>
        </div>

        <div className="thresholds">
          <p>Nudges at 10s, 20s, and 30s of active scroll for fast real-time testing.</p>
        </div>

        <form className="task-form" onSubmit={addTask}>
          <input
            value={newTask}
            onChange={(event) => setNewTask(event.target.value)}
            placeholder="Add a new task..."
            aria-label="New task"
          />
          <button type="submit">Add</button>
        </form>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="status">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="status">No tasks yet. Create your first one.</p>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className={task.completed ? 'done' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(task)}
                  />
                  <span>{task.title}</span>
                </label>
                <button
                  type="button"
                  className="delete"
                  onClick={() => deleteTask(task.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <section className={`feed ${blocked ? 'feed-blocked' : ''}`} onScroll={registerScrollEvent}>
          {FEED_ITEMS.map((item) => (
            <article key={item.id} className="feed-card">
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </section>
      </section>

      {nudge && !blocked && (
        <aside className={`nudge nudge-${nudge.level}`}>
          <h3>{nudge.title}</h3>
          <p>{nudge.message}</p>
          <button type="button" onClick={dismissNudge}>
            Acknowledge and continue
          </button>
        </aside>
      )}

      {blocked && (
        <section className="intervention">
          <div className="intervention-card">
            <h3>Hard stop active</h3>
            <p>Reset your attention. Scrolling unlocks in {cooldownSeconds}s.</p>
            <button type="button" onClick={() => setCooldownSeconds(0)}>
              End cooldown now
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
