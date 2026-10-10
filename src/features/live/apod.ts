// NASA APOD: {date, title, explanation, url, hdurl?, media_type: 'image'|'video', copyright?, thumbnail_url?}
import { isObj, strOf, safeUrl } from './util.ts'
export interface Apod { date: string; title: string; explanation: string; url: string; hdurl: string | null; video: boolean; thumb: string | null; copyright: string | null }
export const APOD_PAGE = 'https://apod.nasa.gov/apod/astropix.html'
/** Community mirror of the APOD API (same JSON fields, no key, CORS on): last resort when both NASA hosts fail. */
export const APOD_MIRROR = 'https://apod.ellanan.com/api'
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const abs = (u: string | undefined) => (u ? safeUrl(new URL(u, APOD_PAGE).href) : null)

/** The APOD web page itself (fallback when api.nasa.gov is down or DEMO_KEY is rate-limited): same shape as the API answer. */
export function apodFromHtml(html: string): Record<string, unknown> {
  const d = /(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\s*<br/i.exec(html), mi = d ? MONTHS.indexOf(d[2].toLowerCase()) : -1
  const date = d && mi >= 0 ? `${d[1]}-${String(mi + 1).padStart(2, '0')}-${d[3].padStart(2, '0')}` : ''
  const img = /<img[^>]+src\s*=\s*"([^"]+)"/i.exec(html)?.[1], hd = /<a\s+href\s*=\s*"(image\/[^"]+)"/i.exec(html)?.[1]
  const frame = /<iframe[^>]+src\s*=\s*"([^"]+)"/i.exec(html)?.[1]
  const after = html.split(/<\/center>/i)[1] ?? '' // the title is the first bold text of the second centered block
  const title = text(/<b>([\s\S]*?)<\/b>/i.exec(after)?.[1] ?? '')
  const credit = /Credit[\s\S]*?:\s*<\/b>([\s\S]*)$/i.exec(after)?.[1]
  const expl = /Explanation:\s*<\/b>([\s\S]*?)(?:<p>\s*<center>|<\/p>\s*<center>|Tomorrow's picture)/i.exec(html)?.[1]
  return {
    date, title, explanation: expl ? text(expl) : '', url: abs(img ?? frame), hdurl: abs(hd), copyright: credit ? text(credit) : '',
    media_type: img ? 'image' : frame ? 'video' : 'other',
  }
}

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
    video: strOf(o.media_type).toLowerCase() !== 'image' || !safeUrl(o.url), thumb: safeUrl(o.thumbnail_url), copyright: copy || null,
  }
}
