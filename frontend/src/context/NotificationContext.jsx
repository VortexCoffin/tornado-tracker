import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useAuth } from './AuthContext'
import { authHeaders } from '../utils/api'

const NotificationContext = createContext(null)
const POLL_MS = 45 * 1000

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const knownIdsRef = useRef(new Set())

  const showBrowserNotification = useCallback((item) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const notification = new Notification(item.title, {
      body: item.body,
      icon: '/favicon.svg',
      tag: item.alertId || item.id,
      requireInteraction: item.severity === 'critical',
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([])
      setUnread(0)
      return
    }

    setLoading(true)
    try {
      const response = await axios.get('/api/notifications', {
        headers: authHeaders(),
      })
      const items = response.data.notifications || []
      setNotifications(items)
      setUnread(response.data.unread || 0)

      for (const item of items) {
        if (!knownIdsRef.current.has(item.id) && !item.read) {
          showBrowserNotification(item)
        }
      }
      knownIdsRef.current = new Set(items.map((item) => item.id))
    } catch (error) {
      console.error('Failed to load notifications', error)
    } finally {
      setLoading(false)
    }
  }, [user, showBrowserNotification])

  useEffect(() => {
    knownIdsRef.current = new Set()
    fetchNotifications()
    if (!user) return undefined

    const interval = setInterval(fetchNotifications, POLL_MS)
    return () => clearInterval(interval)
  }, [user, fetchNotifications])

  const markRead = useCallback(async (notificationId) => {
    const response = await axios.post(
      '/api/notifications/read',
      { notificationId },
      { headers: authHeaders() }
    )
    setNotifications(response.data.notifications || [])
    setUnread(response.data.unread || 0)
  }, [])

  const markAllRead = useCallback(async () => {
    await markRead(null)
  }, [markRead])

  const requestBrowserPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    return Notification.requestPermission()
  }, [])

  const value = useMemo(
    () => ({
      notifications,
      unread,
      loading,
      fetchNotifications,
      markRead,
      markAllRead,
      requestBrowserPermission,
      showBrowserNotification,
    }),
    [
      notifications,
      unread,
      loading,
      fetchNotifications,
      markRead,
      markAllRead,
      requestBrowserPermission,
      showBrowserNotification,
    ]
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}