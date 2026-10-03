// NASA APOD: {date, title, explanation, url, hdurl?, media_type: 'image'|'video', copyright?, thumbnail_url?}
import { isObj, strOf, safeUrl } from './util.ts'
export interface Apod { date: string; title: string; explanation: string; url: string; hdurl: string | null; video: boolean; thumb: string | null; copyright: string | null }
export function parseApod(body: unknown): Apod {
  // A rate-limit answer is {error:{code,message}}: reject. A list (count=) is taken by its first entry.
  const o = Array.isArray(body) ? body[0] : body
  if (!isObj(o) || isObj(o.error)) throw new Error('not an APOD')
  const url = safeUrl(o.url), title = strOf(o.title)
  if (!url || !title) throw new Error('APOD without title/url')
  const copy = strOf(o.copyright).replace(/\s+/g, ' ')
  return {
    date: strOf(o.date), title, explanation: strOf(o.explanation), url, hdurl: safeUrl(o.hdurl),
    video: strOf(o.media_type).toLowerCase() !== 'image', thumb: safeUrl(o.thumbnail_url), copyright: copy || null,
  }
}
