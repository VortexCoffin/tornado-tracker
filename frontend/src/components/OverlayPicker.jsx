import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function OverlayPicker({ overlays, preferences, onChange, compact = false }) {
  const { user } = useAuth()
  const baseLayers = overlays.filter((overlay) => overlay.type === 'base')
  const weatherLayers = overlays.filter((overlay) => overlay.type === 'overlay')

  const handleBaseChange = (overlayId, unlocked) => {
    if (!unlocked) return
    onChange({ overlayId })
  }

  return (
    <div className={`overlay-picker ${compact ? 'compact' : ''}`}>
      <div className="overlay-picker-header">
        <strong>Map overlay</strong>
        {user?.subscription?.tier === 'free' && (
          <Link to="/subscribe" className="overlay-upgrade-link">
            Upgrade
          </Link>
        )}
      </div>

      <div className="overlay-grid">
        {baseLayers.map((overlay) => (
          <button
            key={overlay.id}
            type="button"
            className={`overlay-chip ${preferences.mapOverlay === overlay.id ? 'active' : ''} ${overlay.unlocked ? '' : 'locked'}`}
            onClick={() => handleBaseChange(overlay.id, overlay.unlocked)}
            disabled={!overlay.unlocked}
            title={
              overlay.unlocked
                ? overlay.description
                : `Requires ${overlay.requiredTierName} plan`
            }
          >
            <span>{overlay.name}</span>
            {!overlay.unlocked && <span className="lock">🔒</span>}
          </button>
        ))}
      </div>

      {weatherLayers.length > 0 && (
        <div className="weather-overlay-toggles">
          <span className="weather-label">Weather layers</span>
          <label className={`weather-toggle ${weatherLayers.find((o) => o.id === 'radar')?.unlocked ? '' : 'locked'}`}>
            <input
              type="checkbox"
              checked={Boolean(preferences.showRadar)}
              disabled={!weatherLayers.find((o) => o.id === 'radar')?.unlocked}
              onChange={(e) => onChange({ showRadar: e.target.checked })}
            />
            Radar
          </label>
          <label className={`weather-toggle ${weatherLayers.find((o) => o.id === 'clouds')?.unlocked ? '' : 'locked'}`}>
            <input
              type="checkbox"
              checked={Boolean(preferences.showClouds)}
              disabled={!weatherLayers.find((o) => o.id === 'clouds')?.unlocked}
              onChange={(e) => onChange({ showClouds: e.target.checked })}
            />
            Clouds
          </label>
        </div>
      )}
    </div>
  )
}