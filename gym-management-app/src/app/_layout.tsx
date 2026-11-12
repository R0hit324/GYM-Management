
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

  if (!loaded && !error) {
    return null;
  }

  if (error) {
    console.error('Font loading error:', error);
    return null;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.paper },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(member)" />
        <Stack.Screen name="(reception)" />
        <Stack.Screen name="(owner)" />
      </Stack>
    </ThemeProvider>
  );
}
