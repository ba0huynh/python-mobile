import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/lib/auth';
import { RoleProvider, useRole } from '@/lib/role';
import { SocketProvider } from '@/lib/socket';
import { NotificationBanner } from '@/components/notification-banner';

SplashScreen.preventAutoHideAsync();

// Web focus outline reset
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'goxe-remove-focus-outline';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      *, *:focus, *:focus-visible {
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      input, textarea, select, [contenteditable],
      input:focus, textarea:focus, select:focus, [contenteditable]:focus,
      input:focus-visible, textarea:focus-visible, select:focus-visible, [contenteditable]:focus-visible {
        outline: none !important;
        outline-style: none !important;
        outline-width: 0 !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

function RootStack() {
  const { ready: roleReady } = useRole();
  const { ready: authReady } = useAuth();
  const ready = roleReady && authReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="customer" />
      <Stack.Screen name="driver" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RoleProvider>
        <AuthProvider>
          <SocketProvider>
            <StatusBar style="dark" />
            <RootStack />
            <NotificationBanner />
          </SocketProvider>
        </AuthProvider>
      </RoleProvider>
    </GestureHandlerRootView>
  );
}
