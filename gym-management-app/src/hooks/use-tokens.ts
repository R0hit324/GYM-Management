/**
 * Token access hooks. Components read design tokens only through these —
 * never by importing literal values per screen.
 */
import { useMemo } from 'react';

import {
  Colors,
  Colors as TokenColors,
  ControlHeight,
  Elevation,
  HitTarget,
  Motion,
  Radius,
  Spacing,
  Type,
} from '@/constants/theme';

export type Tokens = {
  colors: typeof Colors;
  spacing: typeof Spacing;
  radius: typeof Radius;
  type: typeof Type;
  motion: typeof Motion;
  control: typeof ControlHeight;
  hitTarget: typeof HitTarget;
  elevation: typeof Elevation;
};

/**
 * The design system ships dark-first ("Coach Board") in Part 1; the scheme
 * parameter is kept so a derived light variant can be added later without
 * touching call sites.
 */
export function useTokens(): Tokens {
  return useMemo(
    () => ({
      colors: TokenColors,
      spacing: Spacing,
      radius: Radius,
      type: Type,
      motion: Motion,
      control: ControlHeight,
      hitTarget: HitTarget,
      elevation: Elevation,
    }),
    [],
  );
}
