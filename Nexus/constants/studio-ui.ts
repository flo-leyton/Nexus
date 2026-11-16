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
    text: '#221C2C',
    muted: '#736B81',
    success: '#20865E',
    warning: '#C47E33',
  },
  dark: {
    canvas: '#131018',
    surface: '#1D1925',
    surfaceRaised: '#272131',
    border: '#393145',
    primary: '#8173F3',
    onPrimary: '#FFFFFF',
    text: '#F6F3FA',
    muted: '#B0A8BC',
    success: '#68D7A4',
    warning: '#F1BA73',
  },
} as const;
