/**
 * Press bridge between pressable surfaces and animated icons.
 *
 * `PressSurface` publishes its press progress (a Reanimated shared value,
 * 0 → 1 while pressed) through this context; any `AnimatedIcon` rendered
 * inside it reads the value on the UI thread and adds a subtle squash.
 * No React state, no re-renders — the context value is a stable shared
 * value reference.
 */
import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type IconPressProgress = SharedValue<number>;

export const IconPressContext = createContext<IconPressProgress | null>(null);
