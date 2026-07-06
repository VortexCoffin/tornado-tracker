import { Fragment, useEffect } from 'react'
import { MapContainer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import MapLayers from './MapLayers'

const CANADA_CENTER = [56, -96]

function FitPastBounds({ events }) {
  const map = useMap()

  useEffect(() => {
    const bounds = events.flatMap((event) => [
      [event.touchdown.lat, event.touchdown.lng],
      [event.dissipation.lat, event.dissipation.lng],
    ])

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] })
    } else {
      map.setView(CANADA_CENTER, 4)
    }
  }, [events, map])

  return null
}

function FlyToEvent({ event }) {
  const map = useMap()

  useEffect(() => {
    if (!event) return
    const midLat = (event.touchdown.lat + event.dissipation.lat) / 2
    const midLng = (event.touchdown.lng + event.dissipation.lng) / 2
    map.flyTo([midLat, midLng], 8, { duration: 0.8 })
  }, [event, map])

  return null
}

function endpointIcon(label, colour) {
  return L.divIcon({
    className: '',
    html: `<div class="track-marker ${label}">
      <span>${label === 'touchdown' ? 'T' : 'D'}</span>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export default function PastTornadoMap({
  events,
  selectedEvent,
  onSelect,
  mapPreferences = { mapOverlay: 'standard', showRadar: false, showClouds: false },
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
      />
      <FitPastBounds events={events} />
      <FlyToEvent event={selectedEvent} />

      {events.map((event) => {
        const selected = selectedEvent?.id === event.id
        const colour = selected ? '#d32f2f' : '#e85d3a'

        return (
          <Fragment key={event.id}>
            <Polyline
              positions={event.path}
              pathOptions={{
                color: colour,
                weight: selected ? 5 : 3,
                opacity: selected ? 1 : 0.75,
                dashArray: selected ? null : '8 6',
              }}
              eventHandlers={{ click: () => onSelect(event.id) }}
            />
            <Marker
              position={[event.touchdown.lat, event.touchdown.lng]}
              icon={endpointIcon('touchdown', colour)}
              eventHandlers={{ click: () => onSelect(event.id) }}
            >
              <Popup>
                <strong>Touchdown</strong>
                <br />
                {event.location}, {event.province}
                <br />
                {event.date}
              </Popup>
            </Marker>
            <Marker
              position={[event.dissipation.lat, event.dissipation.lng]}
              icon={endpointIcon('dissipation', colour)}
              eventHandlers={{ click: () => onSelect(event.id) }}
            >
              <Popup>
                <strong>Dissipation</strong>
                <br />
                {event.location}, {event.province}
                <br />
                {event.date}
              </Popup>
            </Marker>
          </Fragment>
        )
      })}
    </MapContainer>
  )
}