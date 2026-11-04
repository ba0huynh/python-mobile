import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';

/** Tab bar icon renderer. Tabs pass a ColorValue; Ionicons wants a string. */
export function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  }
  return TabIcon;
}
