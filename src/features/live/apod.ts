// NASA APOD: {date, title, explanation, url, hdurl?, media_type: 'image'|'video', copyright?, thumbnail_url?}
import { isObj, strOf, safeUrl } from './util.ts'
export interface Apod { date: string; title: string; explanation: string; url: string; hdurl: string | null; video: boolean; thumb: string | null; copyright: string | null }
export const APOD_PAGE = 'https://apod.nasa.gov/apod/astropix.html'
/** Community mirror of the APOD API (same JSON fields, no key, CORS on): last resort when both NASA hosts fail. */
export const APOD_MIRROR = 'https://apod.ellanan.com/api'
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const abs = (u: string | undefined) => (u ? safeUrl(new URL(u, APOD_PAGE).href) : null)

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined)
const IMG_EXT = /\.(jpe?g|png|gif|webp|tiff?)(\?|#|$)/i
const SITE_NAMES = /^(nasa science|astronomy picture of the day|apod|discover the cosmos!?)$/i

/** The APOD web page itself (fallback when api.nasa.gov is down or DEMO_KEY is rate-limited): same shape as the API answer.
 *  Tolerant of markup changes (quoting, extra site header/branding): the picture is the <img> under APOD's own image/ folder, the title comes
 *  from <title> ("APOD: 2026 October 10 - Title"), and a page without a picture or video throws, so the next mirror is tried instead. */
export function apodFromHtml(html: string): Record<string, unknown> {
  const titleTag = text(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  const d = /(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\b/.exec(titleTag) ?? /(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\s*<br/i.exec(html)
  const mi = d ? MONTHS.indexOf(d[2].toLowerCase()) : -1
  const date = d && mi >= 0 ? `${d[1]}-${String(mi + 1).padStart(2, '0')}-${d[3].padStart(2, '0')}` : ''
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => attr(m[0], 'src')).filter((x): x is string => !!x)
  const img = imgs.find((u) => /(^|\/)image\//i.test(u) && IMG_EXT.test(u)) ?? imgs.find((u) => IMG_EXT.test(u) && !/logo|icon|banner|nasa-?logo|\.svg/i.test(u))
  const hd = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], 'href')).find((u) => !!u && /(^|\/)image\//i.test(u) && IMG_EXT.test(u))
  const frame = [...html.matchAll(/<(?:iframe|source|video|embed)\b[^>]*>/gi)].map((m) => attr(m[0], 'src')).find((u) => !!u && !/googletagmanager|analytics/i.test(u))
  const fromTitle = /\s[-–]\s(.+)$/.exec(titleTag)?.[1]?.trim()
  const after = html.split(/<\/center>/i)[1] ?? ''
  const bold = [...after.matchAll(/<b>([\s\S]*?)<\/b>/gi)].map((m) => text(m[1])).find((x) => x && !SITE_NAMES.test(x) && !/credit|explanation/i.test(x))
  const title = fromTitle && !SITE_NAMES.test(fromTitle) ? fromTitle : bold ?? ''
  const credit = /Credit[\s\S]*?:\s*<\/b>([\s\S]*?)(?:<\/center>|<p>|$)/i.exec(after)?.[1]
  const expl = /Explanation:\s*<\/b>([\s\S]*?)(?:<p>\s*<center>|<\/p>\s*<center>|Tomorrow's picture|<\/p>)/i.exec(html)?.[1]
  if (!date || (!img && !frame)) throw new Error('APOD page without date/picture (layout changed?)')
  return {
    date, title, explanation: expl ? text(expl) : '', url: abs(img ?? frame), hdurl: abs(hd), copyright: credit ? text(credit) : '',
    media_type: img ? 'image' : 'video',
  }
}

/** YouTube/Vimeo embed → a still to show (the API's thumbs=true does this, the web page doesn't). */
const videoThumb = (u: string | null) => { const y = u && /youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/.exec(u); return y ? `https://img.youtube.com/vi/${y[1]}/hqdefault.jpg` : null }

export function parseApod(body: unknown): Apod {
  // A rate-limit answer is {error:{code,message}}: reject. A list (count=) is taken by its first entry. HTML = the APOD page.
  const o = typeof body === 'string' && /<html|<center/i.test(body) ? apodFromHtml(body) : Array.isArray(body) ? body[0] : body
  if (!isObj(o) || isObj(o.error)) throw new Error('not an APOD')
  // Some days are an interactive page/animation without an image url ('other'): link to that day's page instead of failing all day.
  const day = /^\d{2}(\d{2})-(\d{2})-(\d{2})$/.exec(strOf(o.date))
  const url = safeUrl(o.url) ?? (day ? `https://apod.nasa.gov/apod/ap${day[1]}${day[2]}${day[3]}.html` : null), title = strOf(o.title)
  if (!url || !title) throw new Error('APOD without title/url')
  const copy = strOf(o.copyright).replace(/\s+/g, ' ')
  return {
    date: strOf(o.date), title, explanation: strOf(o.explanation), url, hdurl: safeUrl(o.hdurl),
    video: strOf(o.media_type).toLowerCase() !== 'image' || !safeUrl(o.url), thumb: safeUrl(o.thumbnail_url) ?? videoThumb(safeUrl(o.url)), copyright: copy || null,
  }
}
