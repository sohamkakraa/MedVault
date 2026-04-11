import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { createContext, useContext } from 'react';

// Theme color definitions matching web app
const lightTheme = {
  bg: '#f6f2ea',
  fg: '#151515',
  panel: '#ffffff',
  panel2: '#f2ece2',
  muted: '#6e6a63',
  border: '#e2dccf',
  accent: '#137a66',
  accent2: '#c6711e',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

const darkTheme = {
  bg: '#0b1114',
  fg: '#edf1f3',
  panel: '#12191d',
  panel2: '#0f1519',
  muted: '#9aa4ac',
  border: '#1f2a31',
  accent: '#22c55e',
  accent2: '#f59e0b',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

export type Theme = typeof lightTheme;
export type ThemeMode = 'light' | 'dark' | 'system';

// Zustand store for theme preference
interface ThemeStore {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: 'system',
  setMode: (mode: ThemeMode) => set({ mode }),
}));

// Context for theme
export const ThemeContext = createContext<Theme>(lightTheme);

export const useTheme = (): Theme => {
  const mode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();

  const effectiveMode = mode === 'system' ? systemColorScheme || 'light' : mode;
  return effectiveMode === 'dark' ? darkTheme : lightTheme;
};

// Spacing scale
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Border radius
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Typography scale
export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
};

// Shadow definitions
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};
