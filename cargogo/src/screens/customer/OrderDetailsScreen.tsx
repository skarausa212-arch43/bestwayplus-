import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { Card, H2, Sub, Row, StatusPill, Button } from '@/components/UI';
import { useOrderStore } from '@/store/orders';
import { useDriverStore } from '@/store/driver';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

// Экран деталей заказа из истории: маршрут, груз, разбивка цены, история статусов
export const OrderDetailsScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const t = useT();
  const orderId: string | undefined = route?.params?.orderId;
  const order = useOrderStore((s) => s.orders.find((o) => o.id === orderId));
  const vehicle = useDriverStore((s) => s.vehicle);

  if (!order) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Sub>—</Sub>
    </View>
  );

  const priceRows: [string, number][] = [
    [t('sum.transport'), order.price.transport],
    [`${t('sum.dist')} · ${order.distanceKm.toFixed(0)} km`, order.price.distance],
    ...(order.price.loaders ? [[t('sum.loader'), order.price.loaders] as [string, number]] : []),
    ...(order.price.extraStops ? [[t('sum.stops'), order.price.extraStops] as [string, number]] : []),
    ...(order.price.urgentFee ? [[t('sum.urgent'), order.price.urgentFee] as [string, number]] : []),
    [t('sum.svc'), order.price.serviceFee],
    ...(order.price.waiting ? [[t('details.waiting'), order.price.waiting] as [string, number]] : []),
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60, paddingBottom: 40 }}>
      <H2 style={{ marginBottom: spacing.m }}>{t('details.title')}</H2>

      <Card style={{ marginBottom: spacing.m }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
          <StatusPill label={t(`status.${order.status}`)} tone={order.status === 'completed' ? 'brand' : order.status === 'cancelled' ? 'danger' : 'info'} />
          <Text style={{ fontWeight: '900', fontSize: 22, color: colors.ink }}>{order.price.total} zł</Text>
        </Row>
        <Sub style={{ fontWeight: '700', marginBottom: 4 }}>{t('details.route')}</Sub>
        <Sub>📍 {order.pickup.full}</Sub>
        {order.stops.map((s, i) => (
          <Sub key={i}>🔸 {t('details.stop')} {i + 1}: {s.full}</Sub>
        ))}
        <Sub>🏁 {order.destination.full}</Sub>
        <Text style={{ fontSize: 11, color: colors.faint, marginTop: 6 }}>{new Date(order.createdAt).toLocaleString('pl-PL')}</Text>
      </Card>

      <Card style={{ marginBottom: spacing.m }}>
        <Sub style={{ fontWeight: '700', marginBottom: 4 }}>{t('details.cargo')}</Sub>
        <Sub>📦 {order.cargo.name} · {order.cargo.category}</Sub>
        <Sub>{t('details.weight')}: {order.cargo.weightKg} kg{order.cargo.loadersCount ? ` · 💪 ${order.cargo.loadersCount}` : ''}</Sub>
        {order.driverId && (
          <>
            <Sub style={{ fontWeight: '700', marginTop: spacing.s, marginBottom: 4 }}>{t('details.driver')}</Sub>
            <Sub>👨‍🔧 Marek K. · {vehicle.brand} {vehicle.model} · {vehicle.registrationNumber}</Sub>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: spacing.m }}>
        <Sub style={{ fontWeight: '700', marginBottom: 4 }}>{t('details.price')}</Sub>
        {priceRows.map(([label, val]) => (
          <Row key={label} style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <Sub>{label}</Sub><Sub>{val} zł</Sub>
          </Row>
        ))}
        <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: spacing.s, marginTop: 4 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{t('order.total')}</Text>
          <Text style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>{order.price.total} zł</Text>
        </Row>
      </Card>

      <Card style={{ marginBottom: spacing.m }}>
        <Sub style={{ fontWeight: '700', marginBottom: 4 }}>{t('details.history')}</Sub>
        {order.statusHistory.map((h, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <Sub>{t(`status.${h.status}`)}</Sub>
            <Text style={{ fontSize: 11, color: colors.faint }}>
              {new Date(h.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Row>
        ))}
      </Card>

      <Button title={t('common.close')} variant="ghost" onPress={() => navigation.goBack()} />
    </ScrollView>
  );
};
