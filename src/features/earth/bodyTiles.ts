// Streaming detail tiles for bodies other than Earth: NASA Solar System Treks (trek.nasa.gov) WMTS, public NASA/USGS data.
// All "EQ" layers are geographic (equirectangular): level 0 = 2x1 tiles of 256 px, 2^(z+1) x 2^z at level z, north-up, -180..180 east longitude.
// URL: {base}/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.jpg. A tile outside the matrix answers 404 without CORS headers, so maxZ must be exact.
// Moon levels 0-8 confirmed by a third-party project; the other layers could not be reached from the build sandbox (see the commit message).
import { GEOGRAPHIC, type TileSource } from './tiles.ts'

const TREK = 'https://trek.nasa.gov/tiles/'
const trek = (id: string, path: string, name: string, maxZ: number, attribution: string): TileSource => ({
  id, name, maxZ, attribution, licence: 'Public domain (NASA/USGS)', scheme: GEOGRAPHIC,
  url: (z, x, y) => `${TREK}${path}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
})

export type TiledBody = 'moon' | 'mars' | 'mercury'
export const BODY_TILES: Record<TiledBody, TileSource[]> = {
  moon: [trek('trek-moon', 'Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02', 'LRO WAC global mosaic (83 m/px)', 8, 'NASA Solar System Treks / LRO WAC (NASA/GSFC/ASU)')],
  mars: [trek('trek-mars', 'Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m', 'Viking MDIM 2.1 colour mosaic (232 m/px)', 7, 'NASA Solar System Treks / Viking MDIM 2.1 (NASA/USGS)')],
  mercury: [
    trek('trek-mercury', 'Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m', 'MESSENGER MDIS basemap (166 m/px)', 7, 'NASA Solar System Treks / MESSENGER MDIS (NASA/JHUAPL/CIW)'),
    trek('trek-mercury-loi', 'Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m', 'MESSENGER MDIS low-incidence basemap (166 m/px)', 7, 'NASA Solar System Treks / MESSENGER MDIS (NASA/JHUAPL/CIW)'),
  ],
}
export const isTiled = (k: string): k is TiledBody => k in BODY_TILES
