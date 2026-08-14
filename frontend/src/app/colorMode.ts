import { createContext } from 'react';
import type { ColorMode } from './theme';

export interface ColorModeContextValue {
  mode: ColorMode;
  /** null = "follow the system"; 'light'/'dark' = user override. */
  override: ColorMode | null;
  toggle: () => void;
  setOverride: (mode: ColorMode | null) => void;
}

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export const COLOR_MODE_STORAGE_KEY = 'pfa.colorMode';
