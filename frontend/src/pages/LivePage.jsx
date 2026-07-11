import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Header from '../components/Header'
import MapView from '../components/MapView'
import OverlayPicker from '../components/OverlayPicker'
import CurrentWeather from '../components/CurrentWeather'
import GuestAlertAreas from '../components/GuestAlertAreas'
import SafetyTips from '../components/SafetyTips'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../utils/api'
import { useLiveTornadoBrowserAlerts } from '../hooks/useLiveTornadoAlerts'
import { classifyTornadoAlert, safetyTipKey } from '../utils/alerts'
import {
  loadGuestAlertAreas,
  loadGuestMapPrefs,
  saveGuestMapPrefs,
} from '../utils/alertAreas'

const DEFAULT_REFRESH_MS = 10 * 60 * 1000

function formatTime(value) {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function LivePage() {
  const { user, overlays, preferences, updateMapPreferences } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [stale, setStale] = useState(false)
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [pollIntervalMs, setPollIntervalMs] = useState(DEFAULT_REFRESH_MS)
  const [guestPrefs, setGuestPrefs] = useState(() => loadGuestMapPrefs())
  const [guestAreas, setGuestAreas] = useState(() => loadGuestAlertAreas())
  const [guestBrowserAlerts, setGuestBrowserAlerts] = useState(false)
  const [radarMeta, setRadarMeta] = useState(null)

  const mapPreferences = user ? preferences : guestPrefs

  const fetchAlerts = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get('/api/alerts', {
        params: forceRefresh ? { refresh: 'true' } : undefined,
      })
      setAlerts(response.data.alerts || [])
      setStats(response.data.stats || null)
      setLastUpdated(response.data.fetchedAt)
      setStale(Boolean(response.data.stale))
      if (response.data.pollIntervalMs) {
        setPollIntervalMs(response.data.pollIntervalMs)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load alerts. Is the backend running?'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  useEffect(() => {
    const interval = setInterval(() => fetchAlerts(), pollIntervalMs)
    return () => clearInterval(interval)
  }, [fetchAlerts, pollIntervalMs])

  const provinces = useMemo(() => {
    return [...new Set(alerts.map((alert) => alert.province).filter(Boolean))].sort()
  }, [alerts])

  const tornadoAlerts = useMemo(
    () => alerts.filter((alert) => classifyTornadoAlert(alert)),
    [alerts]
  )

  useLiveTornadoBrowserAlerts(
    tornadoAlerts,
    !user && guestBrowserAlerts,
    guestAreas
  )

  const enableGuestBrowserAlerts = async () => {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    setGuestBrowserAlerts(permission === 'granted')
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchesProvince =
        provinceFilter === 'all' || alert.province === provinceFilter
      const matchesType = typeFilter === 'all' || alert.alertType === typeFilter
      const query = search.trim().toLowerCase()
      const matchesSearch =
        query === '' ||
        alert.location?.toLowerCase().includes(query) ||
        alert.alertName?.toLowerCase().includes(query) ||
        alert.province?.toLowerCase().includes(query)

      return matchesProvince && matchesType && matchesSearch
    })
  }, [alerts, provinceFilter, typeFilter, search])

  const selectedAlert =
    filteredAlerts.find((alert) => alert.id === selectedId) ||
    filteredAlerts[0] ||
    null

  useEffect(() => {
    if (filteredAlerts.length > 0 && !filteredAlerts.some((a) => a.id === selectedId)) {
      setSelectedId(filteredAlerts[0].id)
    }
  }, [filteredAlerts, selectedId])

  const handleMapPreferences = async (updates) => {
    if (user) {
      await updateMapPreferences(updates)
      return
    }
    const next = { ...guestPrefs, ...updates }
    if (updates.overlayId) {
      next.mapOverlay = updates.overlayId
    }
    setGuestPrefs(next)
    saveGuestMapPrefs(next)
  }

  return (
    <div className="app">
      <Header>
        {stats && (
          <div className="stats-bar" aria-label="Alert summary">
            <span className="stat warning">{stats.warnings} warnings</span>
            <span className="stat watch">{stats.watches} watches</span>
            <span className="stat total">{stats.total} active</span>
          </div>
        )}
        <span className="status-pill">
          {stale && 'Stale data · '}
          {lastUpdated ? `Updated ${formatTime(lastUpdated)}` : 'Loading...'}
          {pollIntervalMs <= 2 * 60 * 1000
            ? ' · Red alert refresh: 2 min'
            : ' · Yellow alert refresh: 10 min'}
        </span>
        <button
          className="refresh-btn"
          onClick={() => fetchAlerts(true)}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </Header>

      {!user && 'Notification' in window && Notification.permission !== 'granted' && (
        <div className="alert-banner">
          <span>Enable browser alerts for tornado warnings while you browse.</span>
          <button type="button" className="refresh-btn" onClick={enableGuestBrowserAlerts}>
            Enable alerts
          </button>
        </div>
      )}

      <div className="alert-banner alert-banner-info" role="status">
        <span>
          <strong>SMS text alerts coming soon.</strong> Live map alerts and browser
          notifications work now — text messages for tornado warnings are on the way.
        </span>
      </div>

      <div className="layout">
        <aside className="sidebar">
          <SafetyTips tipKey={safetyTipKey(selectedAlert)} />
          <CurrentWeather alertLocation={selectedAlert} />
          {!user && (
            <GuestAlertAreas
              enabled={guestBrowserAlerts}
              onChange={setGuestAreas}
            />
          )}
          <div className="filters">
            <label>
              Search
              <input
                type="search"
                placeholder="Location, province, alert..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Province
              <select
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
              >
                <option value="all">All provinces</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Alert type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                <option value="warning">Warnings</option>
                <option value="watch">Watches</option>
              </select>
            </label>
            <OverlayPicker
              overlays={overlays}
              preferences={mapPreferences}
              compact
              onChange={handleMapPreferences}
            />
          </div>

          <div className="alert-list">
            <div className="sms-coming-soon-chip" role="note">
              SMS alert notifications — coming soon
            </div>
            {loading && alerts.length === 0 && (
              <div className="loading-state">Loading active alerts...</div>
            )}
            {error && <div className="error-state">{error}</div>}
            {!loading && !error && filteredAlerts.length === 0 && (
              <div className="empty-state">
                No tornado or severe thunderstorm alerts are active right now.
              </div>
            )}
            {filteredAlerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className={`alert-card ${selectedAlert?.id === alert.id ? 'active' : ''}`}
                onClick={() => setSelectedId(alert.id)}
              >
                <div className="alert-card-header">
                  <h3>{alert.location}</h3>
                  <span className={`badge ${alert.alertType || 'other'}`}>
                    {alert.alertType || 'alert'}
                  </span>
                </div>
                <div className="alert-meta">
                  <span>{alert.province}</span>
                  <span>{alert.shortName}</span>
                  <span>{formatTime(alert.publishedAt)}</span>
                </div>
                <p className="alert-summary">{alert.summary}</p>
                <p className="alert-sms-note">SMS for this alert — coming soon</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="map-panel">
          <MapView
            alerts={filteredAlerts}
            selectedAlert={selectedAlert}
            onSelect={setSelectedId}
            mapPreferences={mapPreferences}
            onRadarUpdate={setRadarMeta}
          />

          {mapPreferences.showRadar && radarMeta?.generatedAt && (
            <div className="radar-badge">
              Live radar · refreshed{' '}
              {new Date(radarMeta.generatedAt * 1000).toLocaleTimeString('en-CA', {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · updates every 2 min
            </div>
          )}

          {selectedAlert && (
            <div className="detail-panel">
              <h2>
                {selectedAlert.location}, {selectedAlert.province}
              </h2>
              <div className="meta">
                {selectedAlert.alertName} · {selectedAlert.status} · Expires{' '}
                {formatTime(selectedAlert.expiresAt)}
              </div>
              <pre>{selectedAlert.details}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}