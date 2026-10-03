// Launch Library 2 (The Space Devs), 2.3.0 and 2.2.0: {count, results:[{id, name, net, status:{name,abbrev}, launch_service_provider:{name}, rocket:{configuration:{name,full_name}},
// mission:{name,description}, pad:{name, location:{name}}, vid_urls:[{url,title}], webcast_live, info_urls:[{url}] | [string], url}]}
import { isObj, strOf, safeUrl, parseUtc } from './util.ts'
export interface Launch { id: string; name: string; provider: string; rocket: string; pad: string; status: string; statusAbbrev: string; net: number | null; description: string; webcast: string | null; info: string | null; live: boolean }
const link = (x: unknown): string | null => {
  if (!Array.isArray(x)) return safeUrl(x)
  for (const e of x) { const u = safeUrl(isObj(e) ? e.url : e); if (u) return u }
  return null
}
export function parseLaunches(body: unknown): Launch[] {
  const list = isObj(body) ? body.results : null
  if (!Array.isArray(list)) throw new Error('no results')
  const out: Launch[] = []
  for (const r of list) {
    if (!isObj(r)) continue
    const name = strOf(r.name)
    if (!name) continue
    const conf = isObj(r.rocket) && isObj(r.rocket.configuration) ? r.rocket.configuration : {}
    const lsp = isObj(r.launch_service_provider) ? r.launch_service_provider : isObj(r.provider) ? r.provider : {}
    const pad = isObj(r.pad) ? r.pad : {}
    const loc = isObj(pad.location) ? pad.location : {}
    const mission = isObj(r.mission) ? r.mission : {}
    const status = isObj(r.status) ? r.status : {}
    const padName = [strOf(pad.name), strOf(loc.name)].filter(Boolean).join(', ')
    out.push({
      id: strOf(r.id) || name, name, provider: strOf(lsp.name), rocket: strOf(conf.full_name) || strOf(conf.name), pad: padName,
      status: strOf(status.name), statusAbbrev: strOf(status.abbrev), net: parseUtc(r.net ?? r.window_start),
      description: strOf(mission.description), webcast: link(r.vid_urls), info: link(r.info_urls), live: r.webcast_live === true,
    })
  }
  if (out.length === 0 && list.length > 0) throw new Error('unrecognised launches')
  return out
}
