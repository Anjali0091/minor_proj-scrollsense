import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './App.css'

const parseDomains = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)

function App() {
  const [form, setForm] = useState({
    loginEmail: '',
    password: '',
    fullName: '',
    dailyGoalMinutes: 90,
    focusReason: '',
    monitorDomains: 'youtube.com, instagram.com, x.com',
    allowDomains: '',
    gentleSeconds: 10,
    strongSeconds: 20,
    hardStopSeconds: 30,
    cooldownSeconds: 20,
  })
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authMode, setAuthMode] = useState('idle')
  const [lastActivatedAt, setLastActivatedAt] = useState('')
  const [savedEmail, setSavedEmail] = useState('')
  const [activationConfig, setActivationConfig] = useState(null)
  const [isActivated, setIsActivated] = useState(false)
  const [step, setStep] = useState('login')
  const [dashboardSummary, setDashboardSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const isReady = useMemo(() => {
    const hasLogin = Boolean(form.loginEmail.trim()) && Boolean(form.password.trim())
    const hasDetails =
      Boolean(form.fullName.trim()) &&
      Number(form.dailyGoalMinutes || 0) >= 15 &&
      Boolean(form.focusReason.trim())
    const hasMonitored = parseDomains(form.monitorDomains).length > 0

    return hasLogin && hasDetails && hasMonitored
  }, [form])

  useEffect(() => {
    const loadExisting = async () => {
      try {
        const response = await axios.get('/api/extension/setup')
        const setup = response.data
        if (!setup?.config) {
          return
        }

        setActivationConfig(setup.config)
        setIsActivated(Boolean(setup.activated))

        setForm((previous) => ({
          ...previous,
          loginEmail: setup.config.loginEmail || '',
          fullName: setup.config.fullName || '',
          dailyGoalMinutes: setup.config.dailyGoalMinutes || 90,
          focusReason: setup.config.focusReason || '',
          monitorDomains: (setup.config.monitorDomains || []).join(', '),
          allowDomains: (setup.config.allowDomains || []).join(', '),
          gentleSeconds: setup.config.gentleSeconds || 10,
          strongSeconds: setup.config.strongSeconds || 20,
          hardStopSeconds: setup.config.hardStopSeconds || 30,
          cooldownSeconds: setup.config.cooldownSeconds || 20,
        }))

        if (setup.config.loginEmail) {
          setSavedEmail(setup.config.loginEmail)
          window.localStorage.setItem('scrollsense-auth-email', setup.config.loginEmail)
        }

        setLastActivatedAt(setup.updatedAt || '')

        if (setup.activated) {
          setStep('status')
        }
      } catch {
        setError('Could not load existing activation from backend.')
      }
    }

    loadExisting()
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem('scrollsense-auth-email')
    if (stored) {
      setSavedEmail(stored)
      setForm((previous) => ({
        ...previous,
        loginEmail: stored,
      }))
    }
  }, [])

  const updateField = (key, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const authenticate = async (event) => {
    event.preventDefault()
    setStatus('')
    setError('')

    const email = form.loginEmail.trim().toLowerCase()
    const password = form.password.trim()

    if (!email || !password) {
      setError('Enter email and password first.')
      return
    }

    setIsSubmitting(true)
    try {
      const lookup = await axios.get('/api/auth/lookup', {
        params: { email },
      })

      if (lookup.data?.exists) {
        const response = await axios.post('/api/auth/login', { email, password })
        setAuthMode(response.data.mode)
        setSavedEmail(response.data.email)
        window.localStorage.setItem('scrollsense-auth-email', response.data.email)
        setStatus(`Logged in as ${response.data.email}.`)
        setStep('details')
        return
      }

      const response = await axios.post('/api/auth/signup', { email, password })
      setAuthMode(response.data.mode)
      setSavedEmail(response.data.email)
      window.localStorage.setItem('scrollsense-auth-email', response.data.email)
      setStatus(`Signed up and logged in as ${response.data.email}.`)
      setStep('details')
    } catch (authError) {
      const backendMessage = authError?.response?.data?.message
      setError(
        backendMessage
          ? `Authentication failed: ${backendMessage}`
          : 'Authentication failed. Check email/password or backend status.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const activate = async (event) => {
    event.preventDefault()
    setStatus('')
    setError('')

    if (!savedEmail) {
      setError('Authenticate first before activating.')
      return
    }

    if (!isReady) {
      setError('Complete login, required details, and monitored apps/sites before activation.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        loginEmail: savedEmail,
        fullName: form.fullName.trim(),
        dailyGoalMinutes: Number(form.dailyGoalMinutes || 90),
        focusReason: form.focusReason.trim(),
        monitorDomains: parseDomains(form.monitorDomains),
        allowDomains: parseDomains(form.allowDomains),
        gentleSeconds: Number(form.gentleSeconds || 10),
        strongSeconds: Number(form.strongSeconds || 20),
        hardStopSeconds: Number(form.hardStopSeconds || 30),
        cooldownSeconds: Number(form.cooldownSeconds || 20),
        apiBase: 'http://localhost:5000',
      }

      const response = await axios.post('/api/extension/setup', payload)
      setLastActivatedAt(response.data.updatedAt || '')
      setActivationConfig(response.data.config || payload)
      setIsActivated(Boolean(response.data.activated))
      setStatus('Activated. Extension will auto-sync and run detection nudges on reload.')
      setStep('status')
    } catch {
      setError('Activation failed. Ensure backend is running, then try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deactivate = async () => {
    setStatus('')
    setError('')
    setIsSubmitting(true)

    try {
      const response = await axios.post('/api/extension/deactivate')
      setLastActivatedAt(response.data.updatedAt || '')
      setActivationConfig(response.data.config || activationConfig)
      setIsActivated(Boolean(response.data.activated))
      setStatus('Protection deactivated. You can reactivate anytime without signing out.')
      setStep('status')
    } catch {
      setError('Deactivation failed. Ensure backend is running, then try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const loadDashboardSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await axios.get('/api/focus/summary')
      setDashboardSummary(response.data)
    } catch {
      setDashboardSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (step !== 'status') {
      return
    }

    loadDashboardSummary()

    const intervalId = window.setInterval(() => {
      loadDashboardSummary()
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [step, isActivated])

  const formatSeconds = (value) => `${Number(value || 0)}s`

  const getCurrentSessionSeconds = () => {
    const latestSession = dashboardSummary?.latestSession
    if (latestSession?.status === 'active') {
      return Number(latestSession.activeSeconds || 0)
    }

    return 0
  }

  const getCurrentSessionScrollEvents = () => {
    const latestSession = dashboardSummary?.latestSession
    if (latestSession?.status === 'active') {
      return Number(latestSession.scrollEvents || 0)
    }

    return 0
  }

  const renderDashboard = () => {
    const summary = dashboardSummary || {}
    const latestSession = summary.latestSession
    const currentActiveSeconds = getCurrentSessionSeconds()
    const currentScrollEvents = getCurrentSessionScrollEvents()
    const totalSessions = Number(summary.sessionCount || 0)
    const hardStops = Number(summary.nudgeCounts?.hardStop || 0)

    return (
      <section className="dashboard-shell">
        <div className="dashboard-hero">
          <div>
            <p className="eyebrow">Live Anti-Doomscroll</p>
            <h2>Monitor distractions and tasks in one place</h2>
            <p className="subtitle">
              Track current scroll activity, session nudges, and task progress without leaving the interface.
            </p>
          </div>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Current active scroll time</span>
            <strong className="stat-value">{formatSeconds(currentActiveSeconds)}</strong>
            <span className="stat-meta">Live within the current session</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">Current session scroll events</span>
            <strong className="stat-value">{currentScrollEvents}</strong>
            <span className="stat-meta">Scroll, wheel, touch, and pointer activity</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">Total tracked sessions</span>
            <strong className="stat-value">{totalSessions}</strong>
            <span className="stat-meta">All recorded focus sessions</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">Hard stops triggered</span>
            <strong className="stat-value">{hardStops}</strong>
            <span className="stat-meta">Strongest nudge count</span>
          </article>
        </div>

        <div className="content-grid">
          <section className="panel-card">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Thresholds</p>
                <h3>Nudge timing guide</h3>
              </div>
            </div>
            <div className="threshold-list">
              <div className="threshold-item">
                <strong>10s</strong>
                <span>Gentle check-in</span>
              </div>
              <div className="threshold-item">
                <strong>20s</strong>
                <span>Strong refocus alert</span>
              </div>
              <div className="threshold-item">
                <strong>30s</strong>
                <span>Hard-stop reflection nudge</span>
              </div>
            </div>
            <div className="mini-summary">
              <p><strong>Current session:</strong> {latestSession?.status || 'n/a'}</p>
              <p><strong>Last update:</strong> {latestSession?.updatedAt ? new Date(latestSession.updatedAt).toLocaleString() : 'n/a'}</p>
              <p><strong>Summary state:</strong> {summaryLoading ? 'Refreshing...' : 'Live'}</p>
            </div>
          </section>

        </div>

        <div className="action-row dashboard-actions">
          <button type="button" className="button-secondary" onClick={() => setStep('details')} disabled={isSubmitting}>
            Edit details
          </button>
          <button type="button" className="button-secondary" onClick={deactivate} disabled={isSubmitting || !isActivated}>
            Deactivate Protection
          </button>
        </div>
      </section>
    )
  }

  const renderStepTracker = () => (
    <div className="step-tracker" aria-label="Setup progress">
      <span className={step === 'login' ? 'step-chip active' : 'step-chip'} aria-current={step === 'login' ? 'step' : undefined}>1. Login</span>
      <span className={step === 'details' ? 'step-chip active' : 'step-chip'} aria-current={step === 'details' ? 'step' : undefined}>2. Details</span>
      <span className={step === 'status' ? 'step-chip active' : 'step-chip'} aria-current={step === 'status' ? 'step' : undefined}>3. Status</span>
    </div>
  )

  const renderLoginStep = () => (
    <section className="step-shell">
      <h2>Step 1: Login</h2>
      <p className="subtitle">Sign up or login with your email before setting protection details.</p>
      <div className="two-col surface-panel">
        <label>
          Email
          <input
            type="email"
            value={form.loginEmail}
            onChange={(event) => updateField('loginEmail', event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            placeholder="Enter password"
          />
        </label>
      </div>
      <div className="action-row">
        <button type="button" onClick={authenticate} disabled={isSubmitting}>
          {isSubmitting ? 'Checking...' : 'Continue'}
        </button>
      </div>
      {savedEmail && <p className="last-activation">Authenticated as: {savedEmail}</p>}
      {authMode !== 'idle' && <p className="last-activation">Last auth mode: {authMode}</p>}
    </section>
  )

  const renderDetailsStep = () => (
    <section className="step-shell">
      <h2>Step 2: Add details</h2>
      <p className="subtitle">Set your focus profile and monitored sites, then activate protection.</p>

      <div className="two-col surface-panel">
        <label>
          Full name
          <input
            type="text"
            value={form.fullName}
            onChange={(event) => updateField('fullName', event.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          Daily focus goal (minutes)
          <input
            type="number"
            min="15"
            value={form.dailyGoalMinutes}
            onChange={(event) => updateField('dailyGoalMinutes', event.target.value)}
          />
        </label>
      </div>

      <label>
        Why are you blocking distractions?
        <textarea
          value={form.focusReason}
          onChange={(event) => updateField('focusReason', event.target.value)}
          placeholder="Example: I need distraction-free study sessions."
        />
      </label>

      <label>
        Apps/sites to monitor (comma separated)
        <textarea
          value={form.monitorDomains}
          onChange={(event) => updateField('monitorDomains', event.target.value)}
          placeholder="youtube.com, instagram.com, x.com"
        />
      </label>

      <details className="advanced-panel">
        <summary>Advanced settings</summary>
        <label>
          Allow-list domains (optional)
          <input
            type="text"
            value={form.allowDomains}
            onChange={(event) => updateField('allowDomains', event.target.value)}
            placeholder="reddit.com"
          />
        </label>

        <div className="two-col">
          <label>
            Gentle threshold (seconds)
            <input
              type="number"
              min="10"
              value={form.gentleSeconds}
              onChange={(event) => updateField('gentleSeconds', event.target.value)}
            />
          </label>
          <label>
            Strong threshold (seconds)
            <input
              type="number"
              min="20"
              value={form.strongSeconds}
              onChange={(event) => updateField('strongSeconds', event.target.value)}
            />
          </label>
          <label>
            Hard-stop threshold (seconds)
            <input
              type="number"
              min="30"
              value={form.hardStopSeconds}
              onChange={(event) => updateField('hardStopSeconds', event.target.value)}
            />
          </label>
          <label>
            Cooldown (seconds)
            <input
              type="number"
              min="5"
              value={form.cooldownSeconds}
              onChange={(event) => updateField('cooldownSeconds', event.target.value)}
            />
          </label>
        </div>
      </details>

      <div className="action-row">
        <button type="button" className="button-secondary" onClick={() => setStep('login')} disabled={isSubmitting}>
          Back
        </button>
        <button type="button" onClick={activate} disabled={!isReady || isSubmitting || !savedEmail}>
          {isSubmitting ? 'Activating...' : 'Activate Protection'}
        </button>
      </div>
    </section>
  )

  const renderStatusStep = () => (
    <section className="step-shell">
      <h2>Step 3: Final status</h2>
      <p className="subtitle">Your current protection state and setup snapshot.</p>
      {renderDashboard()}
    </section>
  )

  return (
    <main className="page">
      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Web Activation Panel</p>
          <h1>ScrollSense setup flow</h1>
          <p className="subtitle">
            Complete setup in order: login first, add details second, then view final status with deactivate control.
          </p>
          {savedEmail && <p className="identity-chip">Session email: {savedEmail}</p>}
        </header>

        {renderStepTracker()}

        <form className="setup-form" onSubmit={(event) => event.preventDefault()}>
          {step === 'login' && renderLoginStep()}
          {step === 'details' && renderDetailsStep()}
          {step === 'status' && renderStatusStep()}
        </form>

        {status && <p className="status ok">{status}</p>}
        {error && <p className="status error">{error}</p>}

        {lastActivatedAt && <p className="last-activation">Last updated: {new Date(lastActivatedAt).toLocaleString()}</p>}
      </section>
    </main>
  )
}

export default App
