import React, { useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useNotificationStore } from '@/store/notifications';
import { useAuthStore } from '@/store/auth';
import { renderNotifTitle, renderNotifBody } from '@/services/notifications';
import { Card, H2, Sub } from '@/components/UI';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const NotificationsScreen: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role) ?? 'customer';
  const items = useNotificationStore((s) => s.items.filter((i) => i.role === role));
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  useEffect(() => { markAllRead(role); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.l, paddingTop: 60 }}>
      <H2 style={{ marginBottom: spacing.l }}>{t('notif.title')}</H2>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Sub>{t('notif.empty')}</Sub>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.s, opacity: item.read ? 0.75 : 1 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{item.read ? '' : '🟢 '}{renderNotifTitle(item)}</Text>
            <Sub style={{ marginTop: 2 }}>{renderNotifBody(item)}</Sub>
            <Text style={{ fontSize: 10, color: colors.faint, marginTop: 6 }}>
              {new Date(item.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Card>
        )}
      />
    </View>
  );
};
