// Major cities: name, latitude, longitude (degrees, WGS84, city centre) and metropolitan population in millions
// (rounded, around 2020; UN World Urbanization Prospects magnitudes - for ranking and labels only, not statistics).
// Coordinates are the well-known centre points (as in Natural Earth populated places / GeoNames).
export type City = { name: string; lat: number; lon: number; pop: number }

const RAW: [string, number, number, number][] = [
  ['Tokyo', 35.6895, 139.6917, 37.4], ['Delhi', 28.6139, 77.209, 31.0], ['Shanghai', 31.2304, 121.4737, 27.1],
  ['São Paulo', -23.5505, -46.6333, 22.0], ['Mexico City', 19.4326, -99.1332, 21.8], ['Dhaka', 23.8103, 90.4125, 21.0],
  ['Cairo', 30.0444, 31.2357, 20.9], ['Beijing', 39.9042, 116.4074, 20.5], ['Mumbai', 19.076, 72.8777, 20.4],
  ['Osaka', 34.6937, 135.5023, 19.2], ['New York', 40.7128, -74.006, 18.8], ['Karachi', 24.8607, 67.0011, 16.1],
  ['Chongqing', 29.4316, 106.9123, 15.3], ['Buenos Aires', -34.6037, -58.3816, 15.2], ['Istanbul', 41.0082, 28.9784, 15.5],
  ['Kolkata', 22.5726, 88.3639, 14.9], ['Lagos', 6.5244, 3.3792, 14.4], ['Kinshasa', -4.4419, 15.2663, 14.3],
  ['Manila', 14.5995, 120.9842, 13.9], ['Tianjin', 39.3434, 117.3616, 13.6], ['Rio de Janeiro', -22.9068, -43.1729, 13.5],
  ['Guangzhou', 23.1291, 113.2644, 13.5], ['Los Angeles', 34.0522, -118.2437, 12.5], ['Moscow', 55.7558, 37.6173, 12.5],
  ['Lahore', 31.5204, 74.3587, 12.6], ['Shenzhen', 22.5431, 114.0579, 12.4], ['Bangalore', 12.9716, 77.5946, 12.3],
  ['Paris', 48.8566, 2.3522, 11.1], ['Bogotá', 4.711, -74.0721, 11.0], ['Jakarta', -6.2088, 106.8456, 10.8],
  ['Chennai', 13.0827, 80.2707, 11.2], ['Lima', -12.0464, -77.0428, 10.7], ['Bangkok', 13.7563, 100.5018, 10.7],
  ['Seoul', 37.5665, 126.978, 9.9], ['Hyderabad', 17.385, 78.4867, 10.3], ['Nagoya', 35.1815, 136.9066, 9.5],
  ['London', 51.5074, -0.1278, 9.5], ['Tehran', 35.6892, 51.389, 9.0], ['Chicago', 41.8781, -87.6298, 8.9],
  ['Chengdu', 30.5728, 104.0668, 9.1], ['Wuhan', 30.5928, 114.3055, 8.8], ['Ho Chi Minh City', 10.8231, 106.6297, 9.0],
  ['Nanjing', 32.0603, 118.7969, 8.5], ['Luanda', -8.839, 13.2894, 8.3], ['Hanoi', 21.0285, 105.8542, 8.1],
  ['Xi’an', 34.3416, 108.9398, 8.0], ['Kuala Lumpur', 3.139, 101.6869, 8.0], ['Hong Kong', 22.3193, 114.1694, 7.5],
  ['Riyadh', 24.7136, 46.6753, 7.5], ['Baghdad', 33.3152, 44.3661, 7.5], ['Taipei', 25.033, 121.5654, 7.0],
  ['Dar es Salaam', -6.7924, 39.2083, 7.0], ['Santiago', -33.4489, -70.6693, 6.8], ['Madrid', 40.4168, -3.7038, 6.7],
  ['Toronto', 43.6532, -79.3832, 6.3], ['Johannesburg', -26.2041, 28.0473, 6.0], ['Singapore', 1.3521, 103.8198, 5.9],
  ['Khartoum', 15.5007, 32.5599, 5.8], ['Sydney', -33.8688, 151.2093, 5.3], ['Addis Ababa', 9.03, 38.74, 5.2],
  ['Nairobi', -1.2921, 36.8219, 4.9], ['Houston', 29.7604, -95.3698, 7.1], ['Washington', 38.9072, -77.0369, 6.3],
  ['Rome', 41.9028, 12.4964, 4.3], ['Cape Town', -33.9249, 18.4241, 4.6], ['Yangon', 16.8409, 96.1735, 5.4],
  ['Kabul', 34.5553, 69.2075, 4.6], ['Melbourne', -37.8136, 144.9631, 5.1], ['Casablanca', 33.5731, -7.5898, 3.7],
  ['Berlin', 52.52, 13.405, 3.7], ['Dubai', 25.2048, 55.2708, 3.3], ['Athens', 37.9838, 23.7275, 3.2],
  ['Kyiv', 50.4501, 30.5234, 3.0], ['Algiers', 36.7538, 3.0588, 2.8], ['San Francisco', 37.7749, -122.4194, 3.3],
  ['Miami', 25.7617, -80.1918, 6.1], ['Warsaw', 52.2297, 21.0122, 1.8], ['Novosibirsk', 55.0084, 82.9357, 1.6],
  ['Amsterdam', 52.3676, 4.9041, 1.1], ['Perth', -31.9505, 115.8605, 2.1], ['Auckland', -36.8485, 174.7633, 1.7],
  ['Honolulu', 21.3069, -157.8583, 1.0], ['Anchorage', 61.2181, -149.9003, 0.4], ['Reykjavik', 64.1466, -21.9426, 0.2],
  ['Vancouver', 49.2827, -123.1207, 2.6],
]

/** Sorted by population (largest first); names unique. */
export const CITIES: City[] = (() => {
  const seen = new Set<string>()
  return RAW.filter(([n]) => !seen.has(n) && !!seen.add(n))
    .map(([name, lat, lon, pop]) => ({ name, lat, lon, pop }))
    .sort((a, b) => b.pop - a.pop)
})()

/** How many cities get a label at a camera distance (Earth radii from the centre): few from afar, all when close. */
export function labelCount(distRadii: number): number {
  if (distRadii > 9) return 0
  if (distRadii > 5) return 10
  if (distRadii > 3) return 24
  if (distRadii > 1.8) return 48
  return CITIES.length
}
