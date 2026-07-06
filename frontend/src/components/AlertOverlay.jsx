import { Fragment } from 'react'
import { Polygon, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

const RISK_COLOURS = {
  red: '#e53935',
  orange: '#f57c00',
  yellow: '#fbc02d',
  grey: '#78909c',
}

function riskColour(value) {
  return RISK_COLOURS[(value || '').toLowerCase()] || RISK_COLOURS.grey
}

export default function AlertOverlay({ alert, selected, onSelect }) {
  const colour = riskColour(alert.riskColour)
  const positions =
    alert.geometry?.coordinates?.[0]?.map(([lng, lat]) => [lat, lng]) || []

  return (
    <Fragment>
      {positions.length > 0 && (
        <Polygon
          positions={positions}
          pathOptions={{
            color: colour,
            fillColor: colour,
            fillOpacity: selected ? 0.45 : 0.25,
            weight: selected ? 3 : 2,
          }}
          eventHandlers={{ click: () => onSelect(alert.id) }}
        />
      )}
      {alert.centroid && (
        <Marker
          position={[alert.centroid.lat, alert.centroid.lng]}
          icon={L.divIcon({
            className: '',
            html: `<div style="background:${colour};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          })}
          eventHandlers={{ click: () => onSelect(alert.id) }}
        >
          <Popup>
            <strong>{alert.location}</strong>
            <br />
            {alert.alertName}
          </Popup>
        </Marker>
      )}
    </Fragment>
  )
}