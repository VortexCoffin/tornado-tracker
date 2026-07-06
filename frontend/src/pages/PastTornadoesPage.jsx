import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Header from '../components/Header'
import PastTornadoMap from '../components/PastTornadoMap'
import OverlayPicker from '../components/OverlayPicker'
import CurrentWeather from '../components/CurrentWeather'
import { useAuth } from '../context/AuthContext'

export default function PastTornadoesPage() {
  const { user, overlays, preferences, updateMapPreferences } = useAuth()
  const [events, setEvents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [newsArticles, setNewsArticles] = useState([])

  const fetchEvents = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get('/api/past-tornadoes', {
        params: forceRefresh ? { refresh: 'true' } : undefined,
      })
      setEvents(response.data.events || [])
      setSource(response.data.source || '')
      setPeriodStart(response.data.periodStart || '')
      setPeriodEnd(response.data.periodEnd || '')
      setNewsArticles(response.data.newsArticles || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load past tornado data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const provinces = useMemo(() => {
    return [...new Set(events.map((event) => event.province).filter(Boolean))].sort()
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesProvince =
        provinceFilter === 'all' || event.province === provinceFilter
      const query = search.trim().toLowerCase()
      const matchesSearch =
        query === '' ||
        event.location.toLowerCase().includes(query) ||
        event.province.toLowerCase().includes(query) ||
        event.rating.toLowerCase().includes(query)

      return matchesProvince && matchesSearch
    })
  }, [events, provinceFilter, search])

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedId) ||
    filteredEvents[0] ||
    null

  useEffect(() => {
    if (filteredEvents.length > 0 && !filteredEvents.some((e) => e.id === selectedId)) {
      setSelectedId(filteredEvents[0].id)
    }
  }, [filteredEvents, selectedId])

  const weatherLocation = useMemo(() => {
    if (!selectedEvent) return null
    return {
      lat: selectedEvent.touchdown.lat,
      lng: selectedEvent.touchdown.lng,
      label: `${selectedEvent.location}, ${selectedEvent.province}`,
    }
  }, [selectedEvent])

  return (
    <div className="app">
      <Header>
        <span className="status-pill">
          {filteredEvents.length} events · last 30 days
          {periodStart && periodEnd ? ` (${periodStart} – ${periodEnd})` : ''}
        </span>
        <button
          className="refresh-btn"
          type="button"
          onClick={() => fetchEvents(true)}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </Header>

      <div className="past-legend">
        <span className="legend-item">
          <span className="legend-dot touchdown">T</span> Touchdown
        </span>
        <span className="legend-item">
          <span className="legend-dot dissipation">D</span> Dissipation
        </span>
        <span className="legend-item">
          <span className="legend-line" /> Tornado path
        </span>
      </div>

      <div className="layout">
        <aside className="sidebar">
          <CurrentWeather syncLocation={weatherLocation} compact />
          <div className="filters">
            <label>
              Search
              <input
                type="search"
                placeholder="Location, province, rating..."
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
            <p className="settings-note past-period-note">
              Data from the Northern Tornadoes Project and Canadian news sources.
              {source ? ` Sources: ${source}.` : ''}
            </p>
            <OverlayPicker
              overlays={overlays}
              preferences={preferences}
              compact
              onChange={async (updates) => {
                if (!user) return
                try {
                  await updateMapPreferences(updates)
                } catch (err) {
                  setError(err.response?.data?.message || 'Could not update map overlay')
                }
              }}
            />
          </div>

          <div className="alert-list">
            {loading && <div className="loading-state">Loading past tornadoes...</div>}
            {error && <div className="error-state">{error}</div>}
            {!loading && !error && filteredEvents.length === 0 && (
              <div className="empty-state">No confirmed tornadoes in the last 30 days match your filters.</div>
            )}
            {filteredEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`alert-card ${selectedEvent?.id === event.id ? 'active' : ''}`}
                onClick={() => setSelectedId(event.id)}
              >
                <div className="alert-card-header">
                  <h3>{event.location}</h3>
                  <span className="badge warning">{event.rating}</span>
                </div>
                <div className="alert-meta">
                  <span>{event.province}</span>
                  <span>{event.date}</span>
                  <span>
                    {event.fatalities} deaths · {event.injuries} injured
                  </span>
                </div>
                <p className="alert-summary">{event.summary}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="map-panel">
          <PastTornadoMap
            events={filteredEvents}
            selectedEvent={selectedEvent}
            onSelect={setSelectedId}
            mapPreferences={preferences}
          />

          {selectedEvent && (
            <div className="detail-panel">
              <h2>
                {selectedEvent.location}, {selectedEvent.province}
              </h2>
              <div className="meta">
                {selectedEvent.date} · {selectedEvent.rating} · Touchdown{' '}
                {selectedEvent.touchdown.lat.toFixed(2)},{' '}
                {selectedEvent.touchdown.lng.toFixed(2)} → Dissipation{' '}
                {selectedEvent.dissipation.lat.toFixed(2)},{' '}
                {selectedEvent.dissipation.lng.toFixed(2)}
              </div>
              <pre>{selectedEvent.summary}</pre>
              {selectedEvent.news?.length > 0 && (
                <div className="event-news">
                  <h3>News coverage</h3>
                  <ul>
                    {selectedEvent.news.map((article) => (
                      <li key={article.id}>
                        <a href={article.url} target="_blank" rel="noreferrer">
                          {article.title}
                        </a>
                        <span>
                          {article.source}
                          {article.publishedAt
                            ? ` · ${new Date(article.publishedAt).toLocaleDateString('en-CA')}`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedEvent.ntpUrl && (
                <p className="event-source-link">
                  <a href={selectedEvent.ntpUrl} target="_blank" rel="noreferrer">
                    View NTP event details
                  </a>
                </p>
              )}
            </div>
          )}

          {newsArticles.length > 0 && (
            <div className="news-sidebar">
              <h3>Recent tornado news</h3>
              <ul>
                {newsArticles.slice(0, 8).map((article) => (
                  <li key={article.id}>
                    <a href={article.url} target="_blank" rel="noreferrer">
                      {article.title}
                    </a>
                    <span>{article.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}