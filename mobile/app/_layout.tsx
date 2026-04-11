import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme, useThemeStore } from '@/lib/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/lib/auth';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    'space-grotesk': require('@/assets/fonts/SpaceGrotesk-Regular.ttf'),
    'space-grotesk-bold': require('@/assets/fonts/SpaceGrotesk-Bold.ttf'),
    'fraunces': require('@/assets/fonts/Fraunces-Regular.ttf'),
    'fraunces-bold': require('@/assets/fonts/Fraunces-Bold.ttf'),
  });

  useEffect(() => {
    (async () => {
      // Hydrate auth state from secure storage
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        const user = await SecureStore.getItemAsync('user_data');

        if (token && user) {
          useAuthStore.setState({
            isAuthenticated: true,
            token,
            user: JSON.parse(user),
          });
        }
      } catch (error) {
        console.error('Failed to hydrate auth state:', error);
      }

      // Hydrate theme preference
      try {
        const savedTheme = await SecureStore.getItemAsync('theme_mode');
        if (savedTheme) {
          useThemeStore.setState({ mode: savedTheme as any });
        }
      } catch (error) {
        console.error('Failed to hydrate theme:', error);
      }

      if (fontsLoaded) {
        await SplashScreen.hideAsync();
      }
    })();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle={theme.fg === '#151515' ? 'dark-content' : 'light-content'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
