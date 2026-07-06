import { locationsMatch, resolveProvinceCode } from "./locations.js";

export const POLL_RED_MS = 2 * 60 * 1000;
export const POLL_YELLOW_MS = 10 * 60 * 1000;
export const POLL_DEFAULT_MS = 10 * 60 * 1000;

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
];

function alertText(alert) {
  return [alert.alertName, alert.summary, alert.details].filter(Boolean).join(" ");
}

export function isTornadoAlert(alert) {
  return (alert.alertName || "").toLowerCase().includes("tornado");
}

export function isTornadoOnGround(alert) {
  if (!isTornadoAlert(alert)) return false;
  return ON_GROUND_PATTERNS.some((pattern) => pattern.test(alertText(alert)));
}

export function isRedAlert(alert) {
  return isTornadoOnGround(alert);
}

export function isYellowAlert(alert) {
  if (!isTornadoAlert(alert)) return false;
  if (isTornadoOnGround(alert)) return false;

  const colour = (alert.riskColour || "").toLowerCase();
  return (
    alert.alertType === "warning" ||
    alert.alertType === "watch" ||
    colour === "yellow" ||
    colour === "orange"
  );
}

export function getPollIntervalMs(alerts = []) {
  const tornadoAlerts = alerts.filter(isTornadoAlert);

  if (tornadoAlerts.some(isRedAlert)) return POLL_RED_MS;
  if (tornadoAlerts.some(isYellowAlert)) return POLL_YELLOW_MS;
  return POLL_DEFAULT_MS;
}

export function matchesAlertArea(alert, alertAreas = []) {
  if (!alertAreas || alertAreas.length === 0) return true;

  const alertProvince = resolveProvinceCode(alert.province);

  return alertAreas.some((area) => {
    const areaLocation = (area.location || "").trim();
    const areaProvince = resolveProvinceCode(area.province);
    if (!areaLocation) return false;
    if (areaProvince && alertProvince && areaProvince !== alertProvince) return false;
    return locationsMatch(alert.location, areaLocation);
  });
}