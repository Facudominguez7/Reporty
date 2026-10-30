/**
 * First view of the reports map, shared by Leaflet and the tile preload script.
 *
 * Leaflet requests tiles only after its code downloads and runs, so the largest paint of
 * /mapa waits on that chain. The page computes the same first view in an inline script and
 * preloads the tile under the map center: it is the largest visible tile at any viewport,
 * so it is the LCP element.
 */

export type MapPoint = readonly [lat: number, lng: number]

export type MapBounds = readonly [south: number, west: number, north: number, east: number]

export type InitialMapViewConfig = {
  defaultCenter: [lat: number, lng: number]
  defaultZoom: number
  singlePointZoom: number
  minZoom: number
  maxZoom: number
  padding: number
  maxBounds: MapBounds
}

export type InitialMapView = {
  center: [lat: number, lng: number]
  zoom: number
  /** Tile that contains the center pixel of the view, as `[x, y]` at `zoom`. */
  centerTile: [x: number, y: number]
}

export const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

/** Panning bounds for the reports map, extended east to include Candelaria. */
export const POSADAS_BOUNDS: MapBounds = [-27.59, -56.06, -27.32, -55.6]

/** Lowest zoom of the Posadas maps: zooming further out would only show the region around the city. */
export const POSADAS_MIN_ZOOM = 13

export const MAP_MAX_ZOOM = 18

export const INITIAL_MAP_VIEW_CONFIG: InitialMapViewConfig = {
  defaultCenter: [-27.3676, -55.8961],
  defaultZoom: 14,
  singlePointZoom: 14,
  minZoom: POSADAS_MIN_ZOOM,
  maxZoom: MAP_MAX_ZOOM,
  // Same margin LeafletMap uses when reports change; a smaller margin keeps the initial view closer.
  padding: 0.02,
  maxBounds: POSADAS_BOUNDS,
}

/** Bounding box of the points with valid coordinates, or `null` when there is none. */
export function getMapBounds(points: readonly MapPoint[]): MapBounds | null {
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity

  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    south = Math.min(south, lat)
    west = Math.min(west, lng)
    north = Math.max(north, lat)
    east = Math.max(east, lng)
  }

  return south === Infinity ? null : [south, west, north, east]
}

/**
 * Replicates Leaflet for the first view of LeafletMap: the default view without reports,
 * zoom 14 on a single location, and otherwise `fitBounds(bounds.pad(0.1))` (getBoundsZoom
 * rounds the zoom to two decimals and floors it, then the view centers on the middle of the
 * projected bounds). Like Leaflet's `setView`, it then clamps the zoom and moves the center
 * so the view stays inside `maxBounds` (`_limitCenter`).
 *
 * It must stay self-contained, with no imports or outer references, because
 * `getInitialMapTilePreloadScript` serializes it into an inline script.
 */
export function computeInitialMapView(
  bounds: MapBounds | null,
  width: number,
  height: number,
  config: InitialMapViewConfig,
): InitialMapView {
  // Spherical Mercator (EPSG:3857) at zoom 0, scaled to 0..1 like Leaflet's CRS.
  const toWorld = (lat: number, lng: number): [number, number] => {
    const limited = Math.max(Math.min(lat, 85.0511287798), -85.0511287798)
    const sin = Math.sin((limited * Math.PI) / 180)
    return [lng / 360 + 0.5, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)]
  }

  let world: [number, number]
  let zoom: number

  if (!bounds) {
    world = toWorld(config.defaultCenter[0], config.defaultCenter[1])
    zoom = config.defaultZoom
  } else if (bounds[0] === bounds[2] && bounds[1] === bounds[3]) {
    world = toWorld(bounds[0], bounds[1])
    zoom = config.singlePointZoom
  } else {
    const [south, west, north, east] = bounds
    const latPad = (north - south) * config.padding
    const lngPad = (east - west) * config.padding
    const [minX, minY] = toWorld(north + latPad, west - lngPad)
    const [maxX, maxY] = toWorld(south - latPad, east + lngPad)

    // A zero-size container yields NaN; Leaflet clamps that case to its minimum zoom.
    const scale = Math.min(width / ((maxX - minX) * 256), height / ((maxY - minY) * 256)) || 0
    world = [(minX + maxX) / 2, (minY + maxY) / 2]
    zoom = Math.floor(Math.round(Math.log2(scale) * 100) / 100)
  }

  zoom = Math.max(config.minZoom, Math.min(config.maxZoom, zoom))

  const worldSize = 256 * 2 ** zoom
  let centerX = world[0] * worldSize
  let centerY = world[1] * worldSize

  // Leaflet's `_getBoundsOffset` and `_rebound`: centers the view on maxBounds when the view
  // is larger, otherwise pushes it back inside. Offsets of one pixel or less are ignored.
  const rebound = (left: number, right: number) =>
    left + right > 0 ? Math.round(left - right) / 2 : Math.max(0, Math.ceil(left)) - Math.max(0, Math.floor(right))
  const [areaMinX, areaMinY] = toWorld(config.maxBounds[2], config.maxBounds[1])
  const [areaMaxX, areaMaxY] = toWorld(config.maxBounds[0], config.maxBounds[3])
  const offsetX = rebound(areaMinX * worldSize - (centerX - width / 2), -(areaMaxX * worldSize - (centerX + width / 2)))
  const offsetY = rebound(areaMinY * worldSize - (centerY - height / 2), -(areaMaxY * worldSize - (centerY + height / 2)))

  if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
    centerX += offsetX
    centerY += offsetY
  }

  const x = centerX / worldSize
  const y = centerY / worldSize
  const lat = ((Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) * 2 - Math.PI / 2) * 180) / Math.PI

  return {
    center: [lat, (x - 0.5) * 360],
    zoom,
    centerTile: [Math.floor(Math.floor(centerX) / 256), Math.floor(Math.floor(centerY) / 256)],
  }
}

/**
 * Runs in the browser before the map code loads. The map fills the viewport with a minimum
 * height, so the viewport size gives the size LeafletMap will measure.
 *
 * Self-contained for the same reason as `computeInitialMapView`, which it receives as an argument.
 */
function preloadInitialMapTile(
  bounds: MapBounds | null,
  config: InitialMapViewConfig,
  minMapHeight: number,
  tileUrl: string,
  computeView: typeof computeInitialMapView,
) {
  const width = document.documentElement.clientWidth
  const height = Math.max(window.innerHeight, minMapHeight)
  const { zoom, centerTile } = computeView(bounds, width, height, config)

  const link = document.createElement("link")
  link.rel = "preload"
  link.as = "image"
  link.setAttribute("fetchpriority", "high")
  link.href = tileUrl
    .replace("{z}", String(zoom))
    .replace("{x}", String(centerTile[0]))
    .replace("{y}", String(centerTile[1]))
  document.head.appendChild(link)
}

/** Inline script that preloads the center tile of the first map view. */
export function getInitialMapTilePreloadScript(bounds: MapBounds | null, minMapHeight: number): string {
  const args = [bounds, INITIAL_MAP_VIEW_CONFIG, minMapHeight, MAP_TILE_URL]
    .map((value) => JSON.stringify(value).replace(/</g, "\\u003c"))
    .join(",")

  return `(${preloadInitialMapTile.toString()})(${args},${computeInitialMapView.toString()})`
}
