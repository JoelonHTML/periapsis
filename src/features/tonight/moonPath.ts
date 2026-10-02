// Lit part of the Moon's disc as an SVG path.
/** SVG path of the lit part of the Moon (radius r, centred on 0,0), and whether it has to be mirrored. */
export function moonPath(elong: number, r: number, south: boolean) {
  const waxing = elong < 180
  const psi = (waxing ? elong : 360 - elong) * (Math.PI / 180)
  const c = Math.cos(psi)
  const rx = (r * Math.abs(c)).toFixed(2)
  const d = `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${c > 0 ? 0 : 1} 0 ${-r}Z`
  return { d, mirror: waxing === south }
}
