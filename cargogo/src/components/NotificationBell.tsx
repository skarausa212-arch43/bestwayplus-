import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNotificationStore } from '@/store/notifications';
import { useAuthStore } from '@/store/auth';
import { colors, shadows } from '@/theme';
import { Shake, PopIn } from '@/components/Anim';

export const NotificationBell: React.FC<{ navigation: any }> = ({ navigation }) => {
  const role = useAuthStore((s) => s.user?.role) ?? 'customer';
  const unread = useNotificationStore((s) => s.items.filter((i) => i.role === role && !i.read).length);
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Notifications')}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', ...shadows.card }}>
      <Shake active={unread > 0}><Feather name="bell" size={20} color={colors.ink} /></Shake>
      {unread > 0 && (
        <PopIn style={{ position: 'absolute', top: 4, right: 4 }}>
          <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{unread}</Text>
          </View>
        </PopIn>
      )}
    </TouchableOpacity>
  );
};
