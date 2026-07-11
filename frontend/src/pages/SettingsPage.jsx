import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import axios from 'axios'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { normalizeAlertArea } from '../utils/alertAreas'
import { useNotifications } from '../context/NotificationContext'
import { authHeaders, apiErrorMessage } from '../utils/api'
import '../auth.css'

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']

export default function SettingsPage() {
  const { user } = useAuth()
  const { requestBrowserPermission } = useNotifications()
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [browserEnabled, setBrowserEnabled] = useState(true)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [provinces, setProvinces] = useState([])
  const [alertAreas, setAlertAreas] = useState([])
  const [areaLocation, setAreaLocation] = useState('')
  const [areaProvince, setAreaProvince] = useState('SK')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return

    axios
      .get('/api/notifications/preferences', { headers: authHeaders() })
      .then((response) => {
        const prefs = response.data.preferences
        // SMS is coming soon — keep toggle off in the UI for now
        setSmsEnabled(false)
        setInAppEnabled(prefs.inAppEnabled)
        setBrowserEnabled(prefs.browserEnabled)
        setPhoneNumber(prefs.phoneNumber || '')
        setProvinces(prefs.provinces || [])
        setAlertAreas(prefs.alertAreas || [])
      })
      .catch((err) => {
        setError(apiErrorMessage(err, 'Could not load settings'))
      })
      .finally(() => setLoading(false))
  }, [user])

  if (!user) return <Navigate to="/login" replace />

  const toggleProvince = (code) => {
    setProvinces((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    )
  }

  const addAlertArea = () => {
    const entry = normalizeAlertArea(areaLocation, areaProvince)
    if (!entry.location) return

    setAlertAreas((current) => {
      const exists = current.some(
        (area) =>
          area.location.toLowerCase() === entry.location.toLowerCase() &&
          area.province === entry.province
      )
      if (exists) return current
      return [...current, entry]
    })
    setAreaLocation('')
    if (entry.province) setAreaProvince(entry.province)
  }

  const removeAlertArea = (index) => {
    setAlertAreas((current) => current.filter((_, i) => i !== index))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      if (browserEnabled) {
        const permission = await requestBrowserPermission()
        if (permission === 'denied') {
          throw new Error('Browser notifications are blocked. Enable them in your browser settings.')
        }
      }

      await axios.put(
        '/api/notifications/preferences',
        {
          smsEnabled: false, // SMS coming soon
          inAppEnabled,
          browserEnabled,
          phoneNumber,
          provinces,
          alertAreas,
        },
        { headers: authHeaders() }
      )

      setMessage('Notification settings saved.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save settings'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <Header />

      <main className="settings-page">
        <h2>Notification Settings</h2>
        <p className="settings-intro">
          Get in-app and browser alerts when Environment Canada issues a tornado warning or
          active tornado alert. SMS text alerts are coming soon.
        </p>

        {loading ? (
          <div className="loading-state">Loading settings...</div>
        ) : (
          <form className="settings-form" onSubmit={handleSave}>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="settings-success">{message}</div>}

            <section className="settings-section">
              <h3>In-app alerts</h3>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={inAppEnabled}
                  onChange={(e) => setInAppEnabled(e.target.checked)}
                />
                Show tornado warnings and alerts in the notification bell
              </label>
            </section>

            <section className="settings-section">
              <h3>Browser notifications</h3>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={browserEnabled}
                  onChange={(e) => setBrowserEnabled(e.target.checked)}
                />
                Push desktop notifications while the app is open
              </label>
            </section>

            <section className="settings-section">
              <h3>
                SMS text alerts{' '}
                <span className="coming-soon-badge">Coming soon</span>
              </h3>
              <p className="settings-note sms-coming-soon-note">
                Text messages for tornado warnings are not available yet. You can still use
                in-app and browser notifications now — SMS delivery is on the way.
              </p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  disabled
                />
                Send tornado warnings and alerts by text message (coming soon)
              </label>
              <label>
                Mobile number (E.164 format)
                <input
                  type="tel"
                  placeholder="+15551234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled
                />
              </label>
            </section>

            <section className="settings-section">
              <h3>Alert areas</h3>
              <p className="settings-note">
                Subscribe to specific communities only. For example, add Oxbow + SK to get
                alerts for Oxbow, Saskatchewan and nowhere else. Leave empty to use the
                province filter below instead.
              </p>
              <div className="area-add-row">
                <label>
                  Location
                  <input
                    type="text"
                    placeholder="Regina or Oxbow"
                    value={areaLocation}
                    onChange={(e) => setAreaLocation(e.target.value)}
                  />
                </label>
                <label>
                  Province
                  <select
                    value={areaProvince}
                    onChange={(e) => setAreaProvince(e.target.value)}
                  >
                    {PROVINCES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="nav-btn" onClick={addAlertArea}>
                  Add area
                </button>
              </div>
              {alertAreas.length > 0 ? (
                <ul className="area-list">
                  {alertAreas.map((area, index) => (
                    <li key={`${area.location}-${area.province}-${index}`}>
                      <span>
                        {area.location}, {area.province}
                      </span>
                      <button
                        type="button"
                        className="area-remove-btn"
                        onClick={() => removeAlertArea(index)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-note">No specific areas — alerts follow province filter.</p>
              )}
            </section>

            <section className="settings-section">
              <h3>Province filter</h3>
              <p className="settings-note">
                Leave all unchecked to receive alerts for every province. Ignored when alert
                areas are set above.
              </p>
              <div className="province-grid">
                {PROVINCES.map((code) => (
                  <label key={code} className="province-chip">
                    <input
                      type="checkbox"
                      checked={provinces.includes(code)}
                      onChange={() => toggleProvince(code)}
                    />
                    {code}
                  </label>
                ))}
              </div>
            </section>

            <div className="settings-actions">
              <button type="submit" className="auth-submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save settings'}
              </button>
              <Link to="/" className="nav-btn">
                Back to live alerts
              </Link>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}