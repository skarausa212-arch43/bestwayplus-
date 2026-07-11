import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { useNotificationStore } from '@/store/notifications';
import { useAuthStore } from '@/store/auth';
import { colors, shadows } from '@/theme';

export const NotificationBell: React.FC<{ navigation: any }> = ({ navigation }) => {
  const role = useAuthStore((s) => s.user?.role) ?? 'customer';
  const unread = useNotificationStore((s) => s.items.filter((i) => i.role === role && !i.read).length);
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Notifications')}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', ...shadows.card }}>
      <Text style={{ fontSize: 18 }}>🔔</Text>
      {unread > 0 && (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
