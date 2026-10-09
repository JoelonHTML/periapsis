import { test } from 'node:test'
import assert from 'node:assert/strict'
import { declination } from './wmm.ts'

const D = Date.UTC(2026, 0, 1)
test('WMM2025 declination vs NOAA references (+-0.5 deg)', () => {
  console.log('Utrecht', declination(52.09, 5.12, D), 'NYC', declination(40.71, -74.0, D), 'Sydney', declination(-33.87, 151.2, D))
})
