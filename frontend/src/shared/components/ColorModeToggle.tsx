import { IconButton, Tooltip } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { useColorMode } from '../../app/useColorMode';

const LABEL = {
  light: 'Light mode — click to switch to dark',
  dark: 'Dark mode — click to follow system',
  follow: 'Following system — click to switch to light',
} as const;

/**
 * Cycles through light → dark → follow-system on each click. Icon reflects
 * the *current* effective mode (with a "system" glyph when no override).
 */
export function ColorModeToggle() {
  const { mode, override, toggle } = useColorMode();

  const state: keyof typeof LABEL = override ?? 'follow';

  const Icon =
    state === 'light'
      ? LightModeIcon
      : state === 'dark'
        ? DarkModeIcon
        : SettingsBrightnessIcon;

  return (
    <Tooltip title={LABEL[state]}>
      <IconButton
        onClick={toggle}
        size="small"
        aria-label={LABEL[state]}
        color="inherit"
      >
        <Icon fontSize="small" />
        {/* Reference `mode` so the icon color re-renders on effective-mode
            changes even when override stays null. */}
        <span aria-hidden style={{ display: 'none' }}>{mode}</span>
      </IconButton>
    </Tooltip>
  );
}
