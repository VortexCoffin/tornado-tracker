import { useEffect } from 'react'
import { MapContainer, useMap } from 'react-leaflet'
import AlertOverlay from './AlertOverlay'
import MapLayers from './MapLayers'

const CANADA_CENTER = [56, -96]

function FitBounds({ alerts }) {
  const map = useMap()

  useEffect(() => {
    const bounds = alerts
      .flatMap((alert) => alert.geometry?.coordinates?.[0] || [])
      .map(([lng, lat]) => [lat, lng])

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] })
    } else {
      map.setView(CANADA_CENTER, 4)
    }
  }, [alerts, map])

  return null
}

function FlyToAlert({ alert }) {
  const map = useMap()

  useEffect(() => {
    if (!alert?.centroid) return
    map.flyTo([alert.centroid.lat, alert.centroid.lng], 7, { duration: 0.8 })
  }, [alert, map])

  return null
}

export default function MapView({
  alerts,
  selectedAlert,
  onSelect,
  mapPreferences = { mapOverlay: 'standard', showRadar: false, showClouds: false },
  onRadarUpdate,
}) {
  return (
    <MapContainer
      center={CANADA_CENTER}
      zoom={4}
      scrollWheelZoom
      className="map-container"
    >
      <MapLayers
        baseOverlay={mapPreferences.mapOverlay}
        showRadar={mapPreferences.showRadar}
        showClouds={mapPreferences.showClouds}
        onRadarUpdate={onRadarUpdate}
      />
      <FitBounds alerts={alerts} />
      <FlyToAlert alert={selectedAlert} />
      {alerts.map((alert) => (
        <AlertOverlay
          key={alert.id}
          alert={alert}
          selected={selectedAlert?.id === alert.id}
          onSelect={onSelect}
        />
      ))}
    </MapContainer>
  )
}