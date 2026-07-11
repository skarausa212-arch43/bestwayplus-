import React, { useEffect, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { MockMap } from '@/components/MockMap';
import { Card, Button, H2, Sub, Row } from '@/components/UI';
import { NotificationBell } from '@/components/NotificationBell';
import { useDriverStore } from '@/store/driver';
import { useOrderStore } from '@/store/orders';
import { APP_CONFIG } from '@/config/app';
import { TARIFF } from '@/constants';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

export const DriverHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const { isOnline, setOnline, balance, rating } = useDriverStore();
  const orders = useOrderStore((s) => s.orders);
  const assignDriver = useOrderStore((s) => s.assignDriver);
  const [offer, setOffer] = useState<string | null>(null);
  const [timer, setTimer] = useState(APP_CONFIG.offerTimeoutSec);

  // Когда водитель Online — показываем входящий заказ со статусом searching
  const searchingOrder = orders.find((o) => o.status === 'searching');

  useEffect(() => {
    if (isOnline && searchingOrder && offer !== searchingOrder.id) {
      setOffer(searchingOrder.id);
      setTimer(APP_CONFIG.offerTimeoutSec);
    }
  }, [isOnline, searchingOrder?.id]);

  useEffect(() => {
    if (!offer) return;
    if (timer <= 0) { setOffer(null); return; }
    const h = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(h);
  }, [offer, timer]);

  const order = orders.find((o) => o.id === offer);
  const driverNet = order ? Math.round(order.price.total * (1 - TARIFF.commissionPct)) : 0;

  const accept = () => {
    if (!order) return;
    assignDriver(order.id, 'u-drv-1', 'v-1');
    setOffer(null);
    navigation.navigate('DriverActiveOrder');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MockMap height={999} style={{ borderRadius: 0, flex: 1 }} />
      <View style={{ position: 'absolute', top: 54, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Card style={{ paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginRight: 12 }}>{balance} zł</Text>
          <Text style={{ color: colors.warn, fontWeight: '700' }}>★ {rating}</Text>
        </Card>
        <NotificationBell navigation={navigation} />
      </View>

      {/* Входящий заказ с таймером (раздел 32 ТЗ) */}
      {order && (
        <View style={{ position: 'absolute', left: 16, right: 16, top: 120 }}>
          <Card style={{ borderWidth: 2, borderColor: colors.brand }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
              <H2 style={{ fontSize: 17 }}>{t('driver.newOrder')}</H2>
              <View style={{ backgroundColor: timer <= 5 ? colors.dangerSoft : colors.brandSoft, borderRadius: radius.full, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '900', color: timer <= 5 ? colors.danger : colors.brand }}>{timer}</Text>
              </View>
            </Row>
            <Sub>📍 {order.pickup.full}</Sub>
            {order.stops.map((s, i) => (
              <Sub key={i}>🔸 {s.full}</Sub>
            ))}
            <Sub>🏁 {order.destination.full}</Sub>
            <Sub style={{ marginTop: 4 }}>📦 {order.cargo.name} · {order.cargo.weightKg} kg · {order.distanceKm.toFixed(0)} km</Sub>
            {order.cargo.loadersCount > 0 && <Sub>💪 {order.cargo.loadersCount} · {order.cargo.floorFrom}→{order.cargo.floorTo}</Sub>}
            <Row style={{ justifyContent: 'space-between', marginVertical: spacing.m }}>
              <Sub style={{ flex: 1 }}>{t('driver.yourNet', [TARIFF.commissionPct * 100])}</Sub>
              <Text style={{ fontWeight: '900', fontSize: 22, color: colors.brand }}>{driverNet} zł</Text>
            </Row>
            <Row>
              <Button title={t('driver.reject')} variant="ghost" onPress={() => setOffer(null)} style={{ flex: 1, marginRight: 8 }} />
              <Button title={t('driver.accept')} onPress={accept} style={{ flex: 2 }} />
            </Row>
          </Card>
        </View>
      )}

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.l }}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <H2 style={{ fontSize: 18 }}>{isOnline ? t('driver.online') : t('driver.offline')}</H2>
              <Sub>{isOnline ? t('driver.onlineSub') : t('driver.offlineSub')}</Sub>
            </View>
            <Switch value={isOnline} onValueChange={setOnline} trackColor={{ true: colors.brand }} />
          </Row>
          {isOnline && !order && (
            <Sub style={{ marginTop: spacing.s }}>{t('driver.demoHint')}</Sub>
          )}
        </Card>
      </View>
    </View>
  );
};
