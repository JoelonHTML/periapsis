// Sources and licences (what = i18n key) of the Earth imagery and data (shown in the Earth layers panel).
export const EARTH_CREDITS = [
  { what: 'earth.cr.maps', who: 'Solar System Scope textures (solarsystemscope.com/textures), derived from NASA imagery and elevation data; resized/merged as redistributed in the three.js examples (MIT)', licence: 'CC BY 4.0' },
  { what: 'earth.cr.detail', who: 'Zoom imagery: Sentinel-2 cloudless 2020 and 2016 – s2maps.eu by EOX IT Services GmbH (tiles.maps.eox.at; contains modified Copernicus Sentinel data 2020/2016); fallback: NASA Blue Marble via GIBS / EOSDIS (gibs.earthdata.nasa.gov)', licence: 'CC BY-NC-SA 4.0 (2020) / CC BY 4.0 (2016) / public domain' },
  { what: 'earth.cr.lines', who: 'Natural Earth admin-0 countries 1:50m (naturalearthdata.com) via the world-atlas package (ISC), simplified', licence: 'Public domain' },
  { what: 'earth.cr.cities', who: 'Own table of ~80 large cities (coordinates as in Natural Earth / GeoNames, populations rounded)', licence: 'Facts' },
] as const
