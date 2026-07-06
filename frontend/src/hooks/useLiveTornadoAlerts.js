import { useEffect, useRef } from 'react'
import { classifyTornadoAlert } from '../utils/alerts'
import { matchesAlertArea } from '../utils/alertAreas'

const SEEN_KEY = 'ctt_seen_tornado_alerts'

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function saveSeen(seen) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)))
}

export function useLiveTornadoBrowserAlerts(alerts, enabled, alertAreas = []) {
  const seenRef = useRef(loadSeen())

  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') {
      return
    }

    for (const alert of alerts) {
      const type = classifyTornadoAlert(alert)
      if (!type || seenRef.current.has(alert.id)) continue
      if (!matchesAlertArea(alert, alertAreas)) continue

      seenRef.current.add(alert.id)
      saveSeen(seenRef.current)

      const titles = {
        tornado_on_ground: 'Tornado on the ground',
        tornado_warning: 'Tornado Warning',
        tornado_watch: 'Tornado Watch',
        tornado_alert: 'Tornado Alert',
      }
      const title = titles[type] || 'Tornado Alert'
      new Notification(title, {
        body: `${alert.location}, ${alert.province}: ${alert.alertName}`,
        icon: '/favicon.svg',
        tag: alert.id,
        requireInteraction:
          type === 'tornado_on_ground' || type === 'tornado_warning',
      })
    }
  }, [alerts, enabled, alertAreas])
}