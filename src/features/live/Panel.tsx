// World "Vanavond", tab 'live': space weather, NASA picture of the day, launches and close-approaching asteroids.
// Every request goes through getCached (src/lib/net.ts); parsing lives in the .ts files next to this one.
import './i18n'
import { SpaceWeather } from './SpaceWeatherSection'
import { ApodSection } from './ApodSection'
import { LaunchesSection } from './LaunchesSection'
import { AsteroidsSection } from './AsteroidsSection'

export function LivePanel() {
  return (
    <div className="grid gap-3">
      <SpaceWeather />
      <ApodSection />
      <LaunchesSection />
      <AsteroidsSection />
    </div>
  )
}
