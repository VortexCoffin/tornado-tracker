const ON_GROUND_PATTERNS = [
  /on the ground/i,
  /confirmed tornado/i,
  /tornado reported/i,
  /has touched down/i,
  /touchdown/i,
  /tornado spotted/i,
  /observed tornado/i,
  /tornado has been/i,
  /actively occurring/i,
  /currently occurring/i,
]

function alertText(alert) {
  return [alert.alertName, alert.summary, alert.details].filter(Boolean).join(' ')
}

export function isTornadoOnGround(alert) {
  const name = (alert.alertName || '').toLowerCase()
  if (!name.includes('tornado')) return false
  return ON_GROUND_PATTERNS.some((pattern) => pattern.test(alertText(alert)))
}

export function classifyTornadoAlert(alert) {
  const name = (alert.alertName || '').toLowerCase()
  if (!name.includes('tornado')) return null
  if (isTornadoOnGround(alert)) return 'tornado_on_ground'
  if (alert.alertType === 'warning') return 'tornado_warning'
  if (alert.alertType === 'watch') return 'tornado_watch'
  return 'tornado_alert'
}

export function safetyTipKey(alert) {
  if (!alert) return 'default'
  if (isTornadoOnGround(alert)) return 'onGround'
  if (alert.alertType === 'warning') return 'warning'
  if (alert.alertType === 'watch') return 'watch'
  return 'default'
}