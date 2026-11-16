/**
 * NEXUS Studio visual tokens.
 *
 * This module is presentation-only. It must not be imported by domain,
 * device control, transport or recording services.
 */
export const StudioUI = {
  light: {
    canvas: '#F7F6FA',
    surface: '#FFFFFF',
    surfaceRaised: '#F0EEF7',
    border: '#E4E0ED',
    primary: '#6858DB',
    onPrimary: '#FFFFFF',
    consolePrimary: '#6858DB',
    onConsolePrimary: '#FFFFFF',
    text: '#221C2C',
    muted: '#736B81',
    success: '#20865E',
    warning: '#C47E33',
    outline: '#7C7289',
    primaryContainer: '#E8DFFF',
    onPrimaryContainer: '#261447',
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',
  },
  dark: {
    canvas: '#131018',
    surface: '#1D1925',
    surfaceRaised: '#272131',
    border: '#393145',
    // Compatibility for screens still using a hardcoded white button label.
    primary: '#8173F3',
    onPrimary: '#FFFFFF',
    consolePrimary: '#BCB2FF',
    onConsolePrimary: '#23184A',
    text: '#F6F3FA',
    muted: '#B0A8BC',
    success: '#68D7A4',
    warning: '#F1BA73',
    outline: '#84758F',
    primaryContainer: '#3B2E54',
    onPrimaryContainer: '#E6DDFF',
    error: '#FFB4AB',
    errorContainer: '#352027',
    onErrorContainer: '#FFB4AB',
  },
} as const;

export const StudioSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const StudioShape = { control: 12, surface: 16, touchTarget: 48 } as const;
