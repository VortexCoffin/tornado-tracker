import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

const TOKEN_KEY = 'ctt_auth_token'

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

export default function StormsPage() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [caption, setCaption] = useState('')
  const [postLocation, setPostLocation] = useState('')
  const [postProvince, setPostProvince] = useState('SK')
  const [fullscreenPost, setFullscreenPost] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [posting, setPosting] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [commentDrafts, setCommentDrafts] = useState({})
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get('/api/storms/posts', { headers: authHeaders() })
      setPosts(response.data.posts || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load storm photos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setError('')
  }

  const handlePost = async (event) => {
    event.preventDefault()
    if (!user) return
    if (!imageFile) {
      setError('Choose a storm photo to share')
      return
    }

    setPosting(true)
    setError('')

    try {
      const imageData = await readFileAsDataUrl(imageFile)
      await axios.post(
        '/api/storms/posts',
        { caption, imageData, location: postLocation, province: postProvince },
        { headers: authHeaders() }
      )
      setCaption('')
      setImageFile(null)
      setImagePreview('')
      await fetchPosts()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post photo')
    } finally {
      setPosting(false)
    }
  }

  const handleLike = async (postId) => {
    if (!user) return
    try {
      const response = await axios.post(
        `/api/storms/posts/${postId}/like`,
        {},
        { headers: authHeaders() }
      )
      setPosts((current) =>
        current.map((post) => (post.id === postId ? response.data.post : post))
      )
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update like')
    }
  }

  const handleDelete = async (postId) => {
    if (!user) return
    if (!window.confirm('Delete this storm photo? This cannot be undone.')) return

    setDeletingId(postId)
    setError('')

    try {
      await axios.delete(`/api/storms/posts/${postId}`, { headers: authHeaders() })
      setPosts((current) => current.filter((post) => post.id !== postId))
      if (expandedId === postId) setExpandedId(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  const handleReport = async (postId) => {
    if (!user) return
    if (!window.confirm('Report this post as inappropriate?')) return

    try {
      await axios.post(
        `/api/storms/posts/${postId}/report`,
        { reason: 'inappropriate' },
        { headers: authHeaders() }
      )
      setPosts((current) => current.filter((post) => post.id !== postId))
      if (fullscreenPost?.id === postId) setFullscreenPost(null)
      setMessage('Thanks — post reported.')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not report post')
    }
  }

  const handleComment = async (postId) => {
    if (!user) return
    const text = (commentDrafts[postId] || '').trim()
    if (!text) return

    try {
      const response = await axios.post(
        `/api/storms/posts/${postId}/comments`,
        { text },
        { headers: authHeaders() }
      )
      setCommentDrafts((current) => ({ ...current, [postId]: '' }))
      setPosts((current) =>
        current.map((post) => (post.id === postId ? response.data.post : post))
      )
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post comment')
    }
  }

  return (
    <div className="app">
      <Header>
        <span className="status-pill">{posts.length} storm photos</span>
      </Header>

      <main className="storms-page">
        <div className="storms-hero">
          <h2>Storm Spotter Feed</h2>
          <p>
            Share photos of storms across Canada. Like and comment on sightings from other
            spotters.
          </p>
        </div>

        {error && <div className="auth-error storms-error">{error}</div>}
        {message && <div className="settings-success">{message}</div>}

        {user ? (
          <form className="storms-compose" onSubmit={handlePost}>
            <h3>Share a storm photo</h3>
            <div className="storms-compose-grid">
              <label className="storms-upload">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="storms-preview" />
                ) : (
                  <span>Tap to add photo</span>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} />
              </label>
              <div className="storms-compose-fields">
                <label>
                  Caption
                  <textarea
                    placeholder="Describe what you saw — time, storm type..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={3}
                  />
                </label>
                <label>
                  Location
                  <input
                    type="text"
                    placeholder="Oxbow"
                    value={postLocation}
                    onChange={(e) => setPostLocation(e.target.value)}
                  />
                </label>
                <label>
                  Province
                  <select
                    value={postProvince}
                    onChange={(e) => setPostProvince(e.target.value)}
                  >
                    {['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'].map(
                      (code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={posting}>
              {posting ? 'Posting...' : 'Post to feed'}
            </button>
          </form>
        ) : (
          <div className="storms-login-prompt">
            <p>
              <Link to="/login">Log in</Link> or <Link to="/signup">sign up</Link> to share
              storm photos and interact with the community.
            </p>
          </div>
        )}

        {loading ? (
          <div className="loading-state">Loading storm feed...</div>
        ) : posts.length === 0 ? (
          <div className="empty-state">No storm photos yet. Be the first to post!</div>
        ) : (
          <div className="storms-feed">
            {posts.map((post) => (
              <article key={post.id} className="storm-card">
                <header className="storm-card-header">
                  <div>
                    <strong>{post.author.name}</strong>
                    <span>{formatTime(post.createdAt)}</span>
                  </div>
                </header>
                <div className="storm-image-wrap">
                  {post.canDelete && (
                    <button
                      type="button"
                      className="storm-delete-btn"
                      onClick={() => handleDelete(post.id)}
                      disabled={deletingId === post.id}
                      title="Delete photo"
                      aria-label="Delete photo"
                    >
                      {deletingId === post.id ? '…' : '×'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="storm-image-btn"
                    onClick={() => setFullscreenPost(post)}
                  >
                    <img src={post.imageUrl} alt={post.caption} loading="lazy" />
                  </button>
                </div>
                <div className="storm-actions">
                  <button
                    type="button"
                    className={`storm-like-btn ${post.likedByMe ? 'liked' : ''}`}
                    onClick={() => handleLike(post.id)}
                    disabled={!user}
                    title={user ? 'Like' : 'Log in to like'}
                  >
                    {post.likedByMe ? '♥' : '♡'} {post.likeCount}
                  </button>
                  <button
                    type="button"
                    className="storm-comment-toggle"
                    onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
                  >
                    💬 {post.commentCount}
                  </button>
                  {user && !post.canDelete && (
                    <button
                      type="button"
                      className="storm-report-btn"
                      onClick={() => handleReport(post.id)}
                    >
                      Report
                    </button>
                  )}
                </div>
                <p className="storm-caption">
                  <strong>{post.author.name}</strong> {post.caption}
                  {post.location && (
                    <span className="storm-location-tag">
                      {' '}
                      · {post.location}
                      {post.province ? `, ${post.province}` : ''}
                    </span>
                  )}
                </p>

                {expandedId === post.id && (
                  <div className="storm-comments">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="storm-comment">
                        <strong>{comment.author.name}</strong>
                        <span>{comment.text}</span>
                        <time>{formatTime(comment.createdAt)}</time>
                      </div>
                    ))}
                    {user ? (
                      <div className="storm-comment-form">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={commentDrafts[post.id] || ''}
                          onChange={(e) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [post.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleComment(post.id)
                            }
                          }}
                        />
                        <button type="button" className="nav-btn" onClick={() => handleComment(post.id)}>
                          Post
                        </button>
                      </div>
                    ) : (
                      <p className="settings-note">
                        <Link to="/login">Log in</Link> to comment.
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      {fullscreenPost && (
        <div
          className="storm-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreenPost(null)}
        >
          <div className="storm-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="storm-lightbox-close"
              onClick={() => setFullscreenPost(null)}
            >
              ×
            </button>
            <img src={fullscreenPost.imageUrl} alt={fullscreenPost.caption} />
            <p>
              <strong>{fullscreenPost.author.name}</strong> {fullscreenPost.caption}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}