import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'

function formatWhen(value) {
  return new Date(value).toLocaleString('en-CA', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function NotificationBell() {
  const { user } = useAuth()
  const { notifications, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    function handleClick(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!user) return null

  return (
    <div className="notification-bell" ref={panelRef}>
      <button
        type="button"
        className="bell-btn"
        onClick={() => setOpen((value) => !value)}
        aria-label={`${unread} unread notifications`}
      >
        🔔
        {unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <strong>Alerts</strong>
            {unread > 0 && (
              <button type="button" className="text-btn" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">No tornado alerts yet.</div>
            ) : (
              notifications.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-item ${item.read ? 'read' : 'unread'} ${item.severity || ''}`}
                  onClick={() => {
                    if (!item.read) markRead(item.id)
                  }}
                >
                  <div className="notification-item-top">
                    <span className="notification-title">{item.title}</span>
                    <span className={`notification-type ${item.type}`}>
                      {item.type === 'tornado_on_ground'
                        ? 'On ground'
                        : item.type === 'tornado_warning'
                          ? 'Warning'
                          : item.type === 'tornado_watch'
                            ? 'Watch'
                            : 'Alert'}
                    </span>
                  </div>
                  <p>{item.body}</p>
                  <span className="notification-time">{formatWhen(item.createdAt)}</span>
                </button>
              ))
            )}
          </div>

          <div className="notification-panel-footer">
            <Link to="/settings" onClick={() => setOpen(false)}>
              Notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}