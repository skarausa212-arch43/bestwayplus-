import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { MockMap } from '@/components/MockMap';
import { Card, Button, H2, Sub } from '@/components/UI';
import { useOrderStore } from '@/store/orders';
import { t } from '@/i18n';
import { colors, spacing } from '@/theme';

export const SearchingScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const order = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  const assignDriver = useOrderStore((s) => s.assignDriver);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);

  // Имитация: водитель принимает через 4 сек (в реале — ждём accept от водителя)
  useEffect(() => {
    if (!order) return;
    const timer = setTimeout(() => {
      assignDriver(order.id, 'u-drv-1', 'v-1');
      navigation.replace('ActiveOrder');
    }, 4000);
    return () => clearTimeout(timer);
  }, [order?.id]);

  if (!order) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MockMap height={999} style={{ borderRadius: 0, flex: 1 }} searching />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.l }}>
        <Card>
          <H2 style={{ marginBottom: 4 }}>{t('order.searching')}</H2>
          <Sub style={{ marginBottom: spacing.m }}>
            {order.pickup.full} → {order.destination.full} · {order.price.total} zł
          </Sub>
          <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3, marginBottom: spacing.l, overflow: 'hidden' }}>
            <View style={{ height: 6, width: '35%', backgroundColor: colors.brand, borderRadius: 3 }} />
          </View>
          <Button title={t('order.cancel')} variant="danger" onPress={() => { cancelOrder(order.id, 'customer'); navigation.goBack(); }} />
        </Card>
      </View>
    </View>
  );
};
