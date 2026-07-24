import { Icon } from './Icon'

interface AgentLauncherProps {
  isOpen: boolean
  onOpen: () => void
}

export function AgentLauncher({ isOpen, onOpen }: AgentLauncherProps) {
  return (
    <button
      className="agent-launcher"
      type="button"
      aria-label="打开 Agent"
      aria-expanded={isOpen}
      onClick={onOpen}
    >
      <span className="agent-launcher__halo" aria-hidden="true" />
      <Icon name="blossom" size={26} />
    </button>
  )
}
