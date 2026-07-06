import { useEffect, useState } from 'react'
import { TileLayer } from 'react-leaflet'
import axios from 'axios'

const RADAR_REFRESH_MS = 2 * 60 * 1000

const BASE_LAYERS = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, SRTM | Map style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
}

export default function MapLayers({
  baseOverlay = 'standard',
  showRadar = false,
  showClouds = false,
  onRadarUpdate,
}) {
  const [weatherTiles, setWeatherTiles] = useState({ radarPath: null, cloudPath: null })
  const base = BASE_LAYERS[baseOverlay] || BASE_LAYERS.standard

  useEffect(() => {
    if (!showRadar && !showClouds) return undefined

    let active = true
    const loadTiles = async () => {
      try {
        const response = await axios.get('/api/weather/rainviewer')
        if (!active) return
        setWeatherTiles(response.data)
        if (showRadar && onRadarUpdate) {
          onRadarUpdate({
            generatedAt: response.data.generatedAt,
            radarPath: response.data.radarPath,
          })
        }
      } catch (error) {
        console.error('Failed to load weather tiles', error)
      }
    }

    loadTiles()
    const interval = setInterval(loadTiles, showRadar ? RADAR_REFRESH_MS : 5 * 60 * 1000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [showRadar, showClouds, onRadarUpdate])

  return (
    <>
      <TileLayer attribution={base.attribution} url={base.url} />
      {showRadar && weatherTiles.radarPath && (
        <TileLayer
          url={`https://tilecache.rainviewer.com/v2/radar/${weatherTiles.radarPath}/256/{z}/{x}/{y}/2/1_1.png`}
          attribution='<a href="https://www.rainviewer.com/">RainViewer</a>'
          opacity={0.7}
        />
      )}
      {showClouds && weatherTiles.cloudPath && (
        <TileLayer
          url={`https://tilecache.rainviewer.com/v2/satellite/${weatherTiles.cloudPath}/256/{z}/{x}/{y}/0/0_0.png`}
          attribution='<a href="https://www.rainviewer.com/">RainViewer</a>'
          opacity={0.55}
        />
      )}
    </>
  )
}