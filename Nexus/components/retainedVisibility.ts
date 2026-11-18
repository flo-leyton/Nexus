import type { ViewStyle } from 'react-native';

/** Keep the React/native owner mounted without Yoga display:none on retained panels.
 * Temporary RN 0.81 layout mitigation; validate natively before treating as resolved.
 */
export function retainedVisibility(visible: boolean): ViewStyle {
  return visible ? {} : { height: 0, maxHeight: 0, overflow: 'hidden', opacity: 0 };
}
