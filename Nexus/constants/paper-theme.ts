import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { adaptNavigationTheme, MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { StudioShape, StudioUI } from './studio-ui';

function createTheme(dark: boolean): MD3Theme {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  const palette = dark ? StudioUI.dark : StudioUI.light;
  return {
    ...base,
    roundness: StudioShape.control / 3,
    colors: {
      ...base.colors,
      primary: palette.consolePrimary,
      onPrimary: palette.onConsolePrimary,
      primaryContainer: palette.primaryContainer,
      onPrimaryContainer: palette.onPrimaryContainer,
      secondary: palette.consolePrimary,
      onSecondary: palette.onConsolePrimary,
      secondaryContainer: palette.primaryContainer,
      onSecondaryContainer: palette.onPrimaryContainer,
      background: palette.canvas,
      onBackground: palette.text,
      surface: palette.surface,
      onSurface: palette.text,
      surfaceVariant: palette.surfaceRaised,
      onSurfaceVariant: palette.muted,
      outline: palette.outline,
      outlineVariant: palette.border,
      error: palette.error,
      onError: dark ? '#530B0C' : '#FFFFFF',
      errorContainer: palette.errorContainer,
      onErrorContainer: palette.onErrorContainer,
      elevation: {
        level0: 'transparent',
        level1: palette.surface,
        level2: palette.surface,
        level3: palette.surfaceRaised,
        level4: palette.surfaceRaised,
        level5: palette.surfaceRaised,
      },
    },
  };
}

export const NexusPaperTheme = { light: createTheme(false), dark: createTheme(true) };

// Keep React Navigation's fonts/shape while sharing MD3 colors and surfaces.
const adapted = adaptNavigationTheme({
  reactNavigationLight: DefaultTheme,
  reactNavigationDark: DarkTheme,
  materialLight: NexusPaperTheme.light,
  materialDark: NexusPaperTheme.dark,
});
export const NexusNavigationTheme = { light: adapted.LightTheme, dark: adapted.DarkTheme };
