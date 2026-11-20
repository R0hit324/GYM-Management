
/**
 * Root layout. Loads Barlow and Barlow Condensed fonts
 * before rendering the navigation tree.
 */
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';

import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from '@expo-google-fonts/barlow-condensed';

import { Colors } from '@/constants/theme';
import { AuthProviderBoundary } from '@/services/auth';
import { installGlobalErrorHandlers, logger } from '@/services/observability';

SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.accent,
    background: Colors.paper,
    card: Colors.surface,
    text: Colors.ink,
    border: Colors.rule,
    notification: Colors.accent,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Barlow_400: Barlow_400Regular,
    Barlow_500: Barlow_500Medium,
    Barlow_600: Barlow_600SemiBold,
    Barlow_700: Barlow_700Bold,
    BarlowCondensed_500: BarlowCondensed_500Medium,
    BarlowCondensed_600: BarlowCondensed_600SemiBold,
    BarlowCondensed_700: BarlowCondensed_700Bold,
    BarlowCondensed_800: BarlowCondensed_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Stage 2B WS-7: install global error + unhandled-rejection capture for the
  // app. Best effort and idempotent; never throws.
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  if (!loaded && !error) {
    return null;
  }

  if (error) {
    logger.error('app.font_load_failed', 'app', { source: 'expo-font' });
    return null;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      {/* Auth boundary: restores the secure session before anything renders. */}
      <AuthProviderBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.paper },
            // Vanguard motion: workspaces crossfade instead of the stock push.
            // (Expo Router SDK 58's Stack does not expose custom transition
            // timing on Android, so the platform-native timing is kept.)
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(member)" />
          <Stack.Screen name="(reception)" />
          <Stack.Screen name="(owner)" />
          <Stack.Screen name="legal/[doc]" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </AuthProviderBoundary>
    </ThemeProvider>
  );
}
