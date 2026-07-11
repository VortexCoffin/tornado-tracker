import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../utils/api'

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function FeedbackPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [stats, setStats] = useState({ total: 0, positive: 0, negative: 0 })
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(user?.name || '')
  const [rating, setRating] = useState('positive')
  const [comment, setComment] = useState('')

  const loadFeedback = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get('/api/feedback')
      setItems(response.data.feedback || [])
      setStats(response.data.stats || { total: 0, positive: 0, negative: 0 })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load feedback'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFeedback()
  }, [loadFeedback])

  useEffect(() => {
    if (user?.name && !name) setName(user.name)
  }, [user, name])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((item) => item.rating === filter)
  }, [items, filter])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await axios.post('/api/feedback', {
        name: name.trim() || 'Anonymous',
        rating,
        comment: comment.trim(),
      })
      setItems((current) => [response.data.feedback, ...current])
      setStats(response.data.stats || stats)
      setComment('')
      setRating('positive')
      setMessage('Thanks — your feedback was posted.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not post feedback'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app">
      <Header />

      <main className="feedback-page">
        <div className="feedback-hero">
          <h2>Community feedback</h2>
          <p className="settings-intro">
            Tell us what works and what doesn&apos;t. Leave a thumbs up or thumbs down with a
            short comment — for example, &ldquo;works great but sometimes the screen goes
            black&rdquo; or &ldquo;love it, keep going.&rdquo;
          </p>
        </div>

        <div className="feedback-stats">
          <div className="feedback-stat">
            <span className="feedback-stat-value">{stats.total}</span>
            <span className="feedback-stat-label">Total</span>
          </div>
          <div className="feedback-stat positive">
            <span className="feedback-stat-value">{stats.positive}</span>
            <span className="feedback-stat-label">Positive</span>
          </div>
          <div className="feedback-stat negative">
            <span className="feedback-stat-value">{stats.negative}</span>
            <span className="feedback-stat-label">Needs work</span>
          </div>
        </div>

        <section className="feedback-form-card">
          <h3>Leave a comment</h3>
          <form className="feedback-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="settings-success">{message}</div>}

            <label>
              Display name (optional)
              <input
                type="text"
                maxLength={60}
                placeholder="Anonymous"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <fieldset className="feedback-rating">
              <legend>Rating</legend>
              <label className={`rating-option positive ${rating === 'positive' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="rating"
                  value="positive"
                  checked={rating === 'positive'}
                  onChange={() => setRating('positive')}
                />
                <span aria-hidden="true">👍</span>
                Positive
              </label>
              <label className={`rating-option negative ${rating === 'negative' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="rating"
                  value="negative"
                  checked={rating === 'negative'}
                  onChange={() => setRating('negative')}
                />
                <span aria-hidden="true">👎</span>
                Needs work
              </label>
            </fieldset>

            <label>
              Comment
              <textarea
                rows={4}
                maxLength={1000}
                required
                placeholder='e.g. "Works great but sometimes the screen goes black"'
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <div className="feedback-char-count">{comment.length}/1000</div>

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Posting...' : 'Post feedback'}
            </button>
          </form>
        </section>

        <section className="feedback-list-section">
          <div className="feedback-list-header">
            <h3>What people are saying</h3>
            <div className="feedback-filters">
              <button
                type="button"
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={filter === 'positive' ? 'active' : ''}
                onClick={() => setFilter('positive')}
              >
                Positive
              </button>
              <button
                type="button"
                className={filter === 'negative' ? 'active' : ''}
                onClick={() => setFilter('negative')}
              >
                Needs work
              </button>
            </div>
          </div>

          {loading && <div className="loading-state">Loading feedback...</div>}
          {!loading && filtered.length === 0 && (
            <div className="empty-state">No feedback yet — be the first to leave a note.</div>
          )}

          <div className="feedback-list">
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`feedback-card ${item.rating}`}
              >
                <div className="feedback-card-top">
                  <span className={`feedback-rating-badge ${item.rating}`}>
                    {item.rating === 'positive' ? '👍 Positive' : '👎 Needs work'}
                  </span>
                  <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                </div>
                <p className="feedback-comment">{item.comment}</p>
                <div className="feedback-author">— {item.name}</div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
