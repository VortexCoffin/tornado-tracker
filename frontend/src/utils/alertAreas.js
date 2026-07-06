import { locationsMatch, parseLocationInput, resolveProvinceCode } from './locations'

export function matchesAlertArea(alert, alertAreas = []) {
  if (!alertAreas || alertAreas.length === 0) return true

  const alertProvince = resolveProvinceCode(alert.province)

  return alertAreas.some((area) => {
    const areaLocation = (area.location || '').trim()
    const areaProvince = resolveProvinceCode(area.province)
    if (!areaLocation) return false
    if (areaProvince && alertProvince && areaProvince !== alertProvince) return false
    return locationsMatch(alert.location, areaLocation)
  })
}

export function normalizeAlertArea(location, province) {
  const parsed = parseLocationInput(location, province)
  return {
    location: parsed.city,
    province: parsed.province || resolveProvinceCode(province),
  }
}

export const GUEST_AREAS_KEY = 'ctt_guest_alert_areas'

export function loadGuestAlertAreas() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_AREAS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveGuestAlertAreas(areas) {
  localStorage.setItem(GUEST_AREAS_KEY, JSON.stringify(areas))
}

export const GUEST_MAP_KEY = 'ctt_guest_map_prefs'

export function loadGuestMapPrefs() {
  try {
    return JSON.parse(
      localStorage.getItem(GUEST_MAP_KEY) ||
        JSON.stringify({ showRadar: true, showClouds: false, mapOverlay: 'standard' })
    )
  } catch {
    return { showRadar: true, showClouds: false, mapOverlay: 'standard' }
  }
}

export function saveGuestMapPrefs(prefs) {
  localStorage.setItem(GUEST_MAP_KEY, JSON.stringify(prefs))
}