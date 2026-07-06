import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { parseLocationInput } from '../utils/locations'

const LOCATION_KEY = 'ctt_weather_location'

function loadSavedLocation() {
  try {
    return JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null')
  } catch {
    return null
  }
}

function saveLocation(location) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(location))
}

function formatHour(time) {
  return new Date(time).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CurrentWeather({
  alertLocation,
  syncLocation = null,
  compact = false,
}) {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('SK')
  const [locationLabel, setLocationLabel] = useState('')

  const fetchWeather = useCallback(async (params) => {
    setLoading(true)
    setError('')

    try {
      const response = await axios.get('/api/weather/current', { params })
      setWeather(response.data)
      setLocationLabel(
        response.data.location?.province
          ? `${response.data.location.name}, ${response.data.location.province}`
          : response.data.location?.name || 'Your location'
      )
    } catch (err) {
      setWeather(null)
      setError(err.response?.data?.message || 'Could not load weather')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (syncLocation?.lat && syncLocation?.lng) {
      setLocationLabel(syncLocation.label || 'Selected location')
      fetchWeather({ lat: syncLocation.lat, lng: syncLocation.lng })
      return
    }

    if (compact) {
      setLoading(false)
      return
    }

    const saved = loadSavedLocation()
    if (saved?.lat && saved?.lng) {
      setLocationLabel(saved.label || 'Saved location')
      fetchWeather({ lat: saved.lat, lng: saved.lng })
      return
    }

    if (saved?.city) {
      setLocationLabel(saved.label || `${saved.city}, ${saved.province}`)
      fetchWeather({ city: saved.city, province: saved.province })
      return
    }

    if (!navigator.geolocation) {
      fetchWeather({ city: 'Regina', province: 'SK' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        saveLocation({ lat: latitude, lng: longitude, label: 'Your location' })
        setLocationLabel('Your location')
        fetchWeather({ lat: latitude, lng: longitude })
      },
      () => fetchWeather({ city: 'Regina', province: 'SK' }),
      { timeout: 8000 }
    )
  }, [compact, fetchWeather, syncLocation?.lat, syncLocation?.lng, syncLocation?.label])

  useEffect(() => {
    if (syncLocation || compact) return
    if (!alertLocation) return

    if (alertLocation.centroid?.lat && alertLocation.centroid?.lng) {
      setLocationLabel(`${alertLocation.location}, ${alertLocation.province}`)
      fetchWeather({
        lat: alertLocation.centroid.lat,
        lng: alertLocation.centroid.lng,
      })
      return
    }

    if (!alertLocation.location) return

    setLocationLabel(`${alertLocation.location}, ${alertLocation.province}`)
    fetchWeather({
      city: alertLocation.location.split(/[-–,]/)[0].trim(),
      province: alertLocation.province,
    })
  }, [
    alertLocation?.id,
    alertLocation?.centroid?.lat,
    alertLocation?.centroid?.lng,
    alertLocation?.location,
    alertLocation?.province,
    compact,
    fetchWeather,
    syncLocation,
  ])

  const handleSearch = (event) => {
    event.preventDefault()
    const parsed = parseLocationInput(city, province)
    if (!parsed.city) return

    const effectiveProvince = parsed.province || province
    const label = effectiveProvince
      ? `${parsed.city}, ${effectiveProvince}`
      : parsed.city

    saveLocation({ city: parsed.city, province: effectiveProvince, label })
    setLocationLabel(label)
    if (effectiveProvince && effectiveProvince !== province) {
      setProvince(effectiveProvince)
    }
    setCity(parsed.city)
    fetchWeather({ city: parsed.city, province: effectiveProvince })
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        saveLocation({ lat: latitude, lng: longitude, label: 'Your location' })
        setLocationLabel('Your location')
        setCity('')
        fetchWeather({ lat: latitude, lng: longitude })
      },
      () => setError('Could not access your location')
    )
  }

  const stats = weather
    ? [
        { label: 'Feels like', value: `${weather.current.feelsLike}°C` },
        { label: 'Humidity', value: `${weather.current.humidity}%` },
        { label: 'Dew point', value: `${weather.current.dewPoint}°C` },
        {
          label: 'Wind',
          value: `${weather.current.windSpeed} km/h ${weather.current.windDirection}`,
        },
        { label: 'Gusts', value: `${weather.current.windGusts} km/h` },
        { label: 'Pressure', value: `${weather.current.pressure} hPa` },
        { label: 'Cloud cover', value: `${weather.current.cloudCover}%` },
        { label: 'Rain (now)', value: `${weather.current.precipitation} mm` },
      ]
    : []

  return (
    <section className={`current-weather ${compact ? 'compact' : ''}`}>
      <div className="current-weather-header">
        <h3>Current weather</h3>
        {!compact && (
          <button type="button" className="weather-locate-btn" onClick={handleUseMyLocation}>
            My location
          </button>
        )}
      </div>

      {!compact && (
        <form className="weather-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="City (e.g. Regina or Oxbow)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <select value={province} onChange={(e) => setProvince(e.target.value)}>
            {['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'].map(
              (code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              )
            )}
          </select>
          <button type="submit" className="nav-btn">
            Go
          </button>
        </form>
      )}

      {loading && <div className="weather-loading">Loading conditions...</div>}
      {error && !loading && <div className="weather-error">{error}</div>}

      {weather && !loading && (
        <>
          <div className="weather-hero">
            <div className="weather-temp">{weather.current.temperature}°</div>
            <div className="weather-hero-text">
              <strong>{locationLabel}</strong>
              <span>{weather.conditions}</span>
            </div>
          </div>

          <p className="weather-note">{weather.stormNote}</p>

          {weather.hourly?.length > 0 && (
            <div className="hourly-forecast">
              <h4>Next 12 hours</h4>
              <div className="hourly-scroll">
                {weather.hourly.map((hour) => (
                  <div key={hour.time} className="hourly-item">
                    <span>{formatHour(hour.time)}</span>
                    <strong>{hour.temperature}°</strong>
                    <span>{hour.precipitationChance}% rain</span>
                    <span>{hour.windSpeed} km/h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="weather-grid">
            {stats.map((item) => (
              <div key={item.label} className="weather-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <p className="weather-updated">
            Updated{' '}
            {new Date(weather.current.observedAt).toLocaleTimeString('en-CA', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </>
      )}
    </section>
  )
}