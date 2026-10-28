import { useTheme } from '../context/ThemeContext.jsx'
import { IconMoon, IconSun } from './Icons.jsx'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'
  const label = `Switch to ${isLight ? 'dark' : 'light'} theme`
  const Icon = isLight ? IconMoon : IconSun

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm theme-toggle ${compact ? 'compact' : ''}`}
      onClick={toggleTheme}
      title={label}
      aria-label={label}
    >
      <Icon />
      {!compact && <span>{isLight ? 'Dark theme' : 'Light theme'}</span>}
    </button>
  )
}
