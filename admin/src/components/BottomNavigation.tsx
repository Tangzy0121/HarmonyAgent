import { destinations } from '../data/prototype'
import { Icon } from './Icon'
import { LociGlass } from './LociGlass'
import { lociGlassPresets } from '../types/materials'
import type { Destination } from '../types/prototype'

interface BottomNavigationProps {
  activeDestination: Destination
  onSelect: (destination: Destination) => void
}

export function BottomNavigation({ activeDestination, onSelect }: BottomNavigationProps) {
  return (
    <LociGlass
      className="loci-glass--smoke-reference bottom-navigation-surface"
      interactive={false}
      spec={lociGlassPresets.refractive}
      role="presentation"
    >
      <nav className="bottom-navigation" aria-label="主导航">
        {destinations.map((destination) => {
        const isActive = destination.id === activeDestination

        return (
          <button
            key={destination.id}
            className={isActive ? 'navigation-item navigation-item--active' : 'navigation-item'}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(destination.id)}
          >
            <Icon name={destination.id === 'learning' ? 'map' : destination.id} size={19} />
            <span>{destination.label}</span>
          </button>
        )
        })}
      </nav>
    </LociGlass>
  )
}
