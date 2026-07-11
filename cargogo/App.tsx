import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { RootNavigator } from '@/navigation';
import { ToastHost } from '@/components/Toast';
import { initNotifications } from '@/services/notifications';

export default function App() {
  useEffect(() => { initNotifications(); }, []);
  return (
    <View style={{ flex: 1 }}>
      <RootNavigator />
      <ToastHost />
      <StatusBar style="dark" />
    </View>
  );
}
