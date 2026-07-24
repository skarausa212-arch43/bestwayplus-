import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Card, H2, Sub, StatusPill, Row } from '@/components/UI';
import { useOrderStore } from '@/store/orders';
import { useT } from '@/i18n';
import { FadeSlideIn } from '@/components/Anim';
import { colors, spacing } from '@/theme';

export const OrdersHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const orders = useOrderStore((s) => s.orders);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.l, paddingTop: 60 }}>
      <H2 style={{ marginBottom: spacing.l }}>{t('history.title')}</H2>
      <FlatList data={orders} keyExtractor={(o) => o.id}
        renderItem={({ item, index }) => (
          <FadeSlideIn delay={Math.min(index, 6) * 70}>
          <TouchableOpacity activeOpacity={0.75} onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}>
            <Card style={{ marginBottom: spacing.s }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <StatusPill label={t(`status.${item.status}`)} tone={item.status === 'completed' ? 'brand' : item.status === 'cancelled' ? 'danger' : 'info'} />
                <Text style={{ fontWeight: '800', color: colors.ink }}>{item.price.total} zł</Text>
              </Row>
              <Sub>📍 {item.pickup.full}</Sub>
              <Sub>🏁 {item.destination.full}</Sub>
              <Text style={{ fontSize: 11, color: colors.faint, marginTop: 4 }}>{new Date(item.createdAt).toLocaleString('pl-PL')} · ›</Text>
            </Card>
          </TouchableOpacity>
          </FadeSlideIn>
        )} />
    </View>
  );
};
