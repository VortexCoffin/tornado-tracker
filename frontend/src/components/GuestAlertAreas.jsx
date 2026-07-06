import { useState } from 'react'
import {
  loadGuestAlertAreas,
  normalizeAlertArea,
  saveGuestAlertAreas,
} from '../utils/alertAreas'

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']

export default function GuestAlertAreas({ enabled, onChange }) {
  const [areas, setAreas] = useState(() => loadGuestAlertAreas())
  const [location, setLocation] = useState('')
  const [province, setProvince] = useState('SK')

  if (!enabled) return null

  const persist = (next) => {
    setAreas(next)
    saveGuestAlertAreas(next)
    onChange?.(next)
  }

  const addArea = () => {
    const entry = normalizeAlertArea(location, province)
    if (!entry.location) return
    if (
      areas.some(
        (area) =>
          area.location.toLowerCase() === entry.location.toLowerCase() &&
          area.province === entry.province
      )
    ) {
      return
    }
    persist([...areas, entry])
    setLocation('')
    if (entry.province) setProvince(entry.province)
  }

  const removeArea = (index) => {
    persist(areas.filter((_, i) => i !== index))
  }

  return (
    <section className="guest-alert-areas">
      <h3>Your alert areas</h3>
      <p className="settings-note">
        Browser alerts only for these communities. Example: Oxbow + SK.
      </p>
      <div className="area-add-row">
        <label>
          Location
          <input
            type="text"
            placeholder="Regina or Oxbow"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label>
          Province
          <select value={province} onChange={(e) => setProvince(e.target.value)}>
            {PROVINCES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="nav-btn" onClick={addArea}>
          Add
        </button>
      </div>
      {areas.length > 0 ? (
        <ul className="area-list">
          {areas.map((area, index) => (
            <li key={`${area.location}-${area.province}`}>
              <span>
                {area.location}, {area.province}
              </span>
              <button type="button" className="area-remove-btn" onClick={() => removeArea(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-note">No areas set — all tornado alerts will notify you.</p>
      )}
    </section>
  )
}