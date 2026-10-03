// Fixtures that follow the documented API shapes (NOT captured from the live services). Used by tests and the visual check.
export function kpFixture(now: number): unknown {
  const rows: unknown[] = [['time_tag', 'kp', 'observed', 'noaa_scale']]
  const start = Math.floor(now / 10800000) * 10800000 - 4 * 10800000
  const kps = [2.33, 3.0, 3.67, 4.33, 5.0, 5.67, 4.67, 3.33, 3.0, 2.67, 2.33, 2.0, 2.33, 3.0, 3.33, 3.0, 2.67, 2.33, 2.0, 1.67, 2.0, 2.33, 2.67, 2.33, 2.0, 1.67, 1.33]
  kps.forEach((kp, i) => {
    const t = start + i * 10800000
    const tag = new Date(t).toISOString().slice(0, 19).replace('T', ' ')
    rows.push([tag, String(kp), t + 10800000 <= now ? 'observed' : t <= now ? 'estimated' : 'predicted', kp >= 5 ? 'G1' : null])
  })
  return rows
}
export function ovationFixture(): unknown {
  // Oval sketch: probability falls off from a ring at ~64° N (higher with longitude noise); southern ring at ~-66°.
  const coordinates: number[][] = []
  for (let lon = 0; lon < 360; lon++) for (let lat = -90; lat <= 90; lat++) {
    const ring = 63 - 4 * Math.cos((lon - 10) * Math.PI / 180)
    const d = Math.abs(Math.abs(lat) - ring)
    const p = Math.max(0, Math.round(80 * Math.exp(-d * d / 18)))
    coordinates.push([lon, lat, p])
  }
  return { 'Observation Time': '2026-10-03T18:40:00Z', 'Forecast Time': '2026-10-03T19:30:00Z', 'Data Format': '[Longitude, Latitude, Aurora]', coordinates }
}
export const plasmaFixture = [['time_tag', 'density', 'speed', 'temperature'], ['2026-10-03 18:50:00.000', '5.2', '455.1', '110000'], ['2026-10-03 18:51:00.000', '5.4', '462.7', '112000'], ['2026-10-03 18:52:00.000', null, null, null]]
export const magFixture = [['time_tag', 'bx_gsm', 'by_gsm', 'bz_gsm', 'lon_gsm', 'lat_gsm', 'bt'], ['2026-10-03 18:50:00.000', '1.2', '-3.0', '-4.8', '248.2', '-40.1', '6.1'], ['2026-10-03 18:51:00.000', '1.0', '-3.1', '-5.6', '250.0', '-42.0', '6.6']]
export const flareFixture = [{ time_tag: '2026-10-03T14:10:00Z', begin_time: '2026-10-03T14:02:00Z', begin_class: 'C2.1', max_time: '2026-10-03T14:10:00Z', max_class: 'M1.4', max_xrlong: 1.4e-5, end_time: '2026-10-03T14:22:00Z', end_class: 'C5.0', satellite: 19 }]
export const apodFixture = { date: '2026-10-03', title: 'The Pillars of Creation in Infrared', explanation: 'What do the Pillars of Creation look like in infrared? Dark dust is transparent here, so the newborn stars hidden inside glow through. This long explanation continues for a while so the collapsed view has something to clip. '.repeat(3), url: 'https://apod.nasa.gov/apod/image/2610/pillars_1024.jpg', hdurl: 'https://apod.nasa.gov/apod/image/2610/pillars_big.jpg', media_type: 'image', service_version: 'v1', copyright: 'Some Astro\nPhotographer' }
export function launchesFixture(now: number): unknown {
  const mk = (i: number, name: string, prov: string, rocket: string, pad: string, st: string, ab: string, hrs: number) => ({
    id: `id-${i}`, name, net: new Date(now + hrs * 3600000).toISOString(), status: { id: 1, name: st, abbrev: ab },
    launch_service_provider: { name: prov }, rocket: { configuration: { name: rocket, full_name: rocket } },
    mission: { name: 'Mission', description: 'Delivers a batch of satellites to low Earth orbit. Booster recovery is planned on a drone ship.' },
    pad: { name: pad, location: { name: 'Florida, USA' } }, webcast_live: false,
    vid_urls: i % 2 ? [{ url: 'https://www.youtube.com/watch?v=abc', title: 'Webcast' }] : [], info_urls: [{ url: 'https://example.org/info' }],
  })
  return { count: 3, next: null, results: [mk(1, 'Falcon 9 Block 5 | Starlink Group 10-5', 'SpaceX', 'Falcon 9 Block 5', 'Space Launch Complex 40', 'Go for Launch', 'Go', 5.5), mk(2, 'Ariane 6 | CSO-4', 'Arianespace', 'Ariane 62', 'ELA-4', 'To Be Confirmed', 'TBC', 52), mk(3, 'New Glenn | Blue Moon MK1', 'Blue Origin', 'New Glenn', 'Launch Complex 36', 'To Be Determined', 'TBD', 24 * 9)] }
}
export const cadFixture = {
  signature: { source: 'NASA/JPL SBDB Close Approach Data API', version: '1.5' }, count: 3,
  fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h'],
  data: [
    ['2026 TX3', '12', '2461318.123', '2026-Oct-08 14:56', '0.0123456', '0.0123', '0.0124', '9.87', '9.85', '< 00:01', '24.1'],
    ['433', '650', '2461330.5', '2026-Oct-21 00:00', '0.0450000', '0.0450', '0.0450', '5.80', '5.78', '00:01', '10.4'],
    ['2026 UQ', '3', '2461341.0', '2026-Nov-01 12:00', '0.0300000', '0.0200', '0.0400', '14.2', '14.1', '2_03:00', null],
  ],
}
