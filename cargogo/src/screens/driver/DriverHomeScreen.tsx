import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppMap, orderPoints } from '@/components/Map';
import { FadeSlideIn, Breathe } from '@/components/Anim';
import { Card, Button, H2, Sub, Row } from '@/components/UI';
import { NotificationBell } from '@/components/NotificationBell';
import { useDriverStore } from '@/store/driver';
import { useOrderStore } from '@/store/orders';
import { APP_CONFIG } from '@/config/app';
import { getDriverPricingView } from '@/features/pricing/pricingSelectors';
import { formatGr, haversineKm } from '@/features/pricing/pricingHelpers';
import { useCommunityStore } from '@/store/community';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

export const DriverHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const { isOnline, setOnline, balance, rating, searchRadiusKm, setSearchRadius, position } = useDriverStore();
  const customerRating = useCommunityStore((s) => s.customerRating);
  const orders = useOrderStore((s) => s.orders);
  const assignDriver = useOrderStore((s) => s.assignDriver);
  const [offer, setOffer] = useState<string | null>(null);
  const [timer, setTimer] = useState(APP_CONFIG.offerTimeoutSec);

  // Когда водитель Online — заказ показывается, только если он в радиусе приёма
  const searchingOrder = orders.find((o) => o.status === 'searching');
  const orderInRadius = searchingOrder
    ? haversineKm(position.lat, position.lng, searchingOrder.pickup.lat, searchingOrder.pickup.lng) <= searchRadiusKm
    : false;

  useEffect(() => {
    if (isOnline && searchingOrder && orderInRadius && offer !== searchingOrder.id) {
      setOffer(searchingOrder.id);
      setTimer(APP_CONFIG.offerTimeoutSec);
    }
  }, [isOnline, searchingOrder?.id, orderInRadius]);

  useEffect(() => {
    if (!offer) return;
    if (timer <= 0) { setOffer(null); return; }
    const h = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(h);
  }, [offer, timer]);

  const order = orders.find((o) => o.id === offer);
  // §8: водитель видит СВОЮ выплату (нетто), а не цену клиента и не % комиссии
  const payoutView = order?.pricing ? getDriverPricingView(order.pricing) : null;

  const accept = () => {
    if (!order) return;
    assignDriver(order.id, 'u-drv-1', 'v-1');
    setOffer(null);
    navigation.navigate('DriverActiveOrder');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppMap height={999} style={{ borderRadius: 0, flex: 1 }} showRoute={!!order} points={orderPoints(order)}
        searching={isOnline && !order}
        radiusKm={isOnline && !order ? searchRadiusKm : undefined}
        center={{ latitude: position.lat, longitude: position.lng }} />
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
          <FadeSlideIn>
          <Card style={{ borderWidth: 2, borderColor: colors.brand }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
              <View style={{ flex: 1 }}>
                <H2 style={{ fontSize: 17 }}>{t('driver.newOrder')}</H2>
                {/* Рейтинг клиента виден водителю (оценки в обе стороны) */}
                <Row style={{ marginTop: 2 }}>
                  <Feather name="star" size={13} color={colors.warn} />
                  <Text style={{ color: colors.sub, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>{customerRating.toFixed(1)} · {t('offer.clientRating')}</Text>
                </Row>
              </View>
              <Breathe active={timer <= 5}>
              <View style={{ backgroundColor: timer <= 5 ? colors.dangerSoft : colors.brandSoft, borderRadius: radius.full, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '900', color: timer <= 5 ? colors.danger : colors.brand }}>{timer}</Text>
              </View>
              </Breathe>
            </Row>
            <Sub>📍 {order.pickup.full}</Sub>
            {order.stops.map((s, i) => (
              <Sub key={i}>🔸 {s.full}</Sub>
            ))}
            <Sub>🏁 {order.destination.full}</Sub>
            <Sub style={{ marginTop: 4 }}>📦 {order.cargo.name} · {order.cargo.weightKg} kg · {order.distanceKm.toFixed(0)} km</Sub>
            {order.cargo.loadersCount > 0 && <Sub>💪 {order.cargo.loadersCount} · {order.cargo.floorFrom}→{order.cargo.floorTo}</Sub>}
            <Row style={{ justifyContent: 'space-between', marginVertical: spacing.m }}>
              <Sub style={{ flex: 1 }}>{t('driver.payout')}</Sub>
              <Text style={{ fontWeight: '900', fontSize: 22, color: colors.brand }}>{formatGr(payoutView?.totalGr ?? 0, 2)}</Text>
            </Row>
            <Row>
              <Button title={t('driver.reject')} variant="ghost" onPress={() => setOffer(null)} style={{ flex: 1, marginRight: 8 }} />
              <Button title={t('driver.accept')} onPress={accept} style={{ flex: 2 }} />
            </Row>
          </Card>
          </FadeSlideIn>
        </View>
      )}

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.l }}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row>
                {isOnline && <Breathe><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginRight: 8 }} /></Breathe>}
                <H2 style={{ fontSize: 18 }}>{isOnline ? t('driver.online') : t('driver.offline')}</H2>
              </Row>
              <Sub>{isOnline ? t('driver.onlineSub') : t('driver.offlineSub')}</Sub>
            </View>
            <Switch value={isOnline} onValueChange={setOnline} trackColor={{ true: colors.brand }} />
          </Row>

          {/* Радиус приёма заказов: заказы вне круга водителю не приходят */}
          <View style={{ marginTop: spacing.m, borderTopWidth: 1, borderColor: colors.line, paddingTop: spacing.m }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
              <Row>
                <Feather name="target" size={15} color={colors.brandDark} />
                <Sub style={{ marginLeft: 6, fontWeight: '700', color: colors.ink }}>{t('driver.radius')}</Sub>
              </Row>
              <Text style={{ fontWeight: '900', color: colors.brandDark, fontSize: 16 }}>{searchRadiusKm} km</Text>
            </Row>
            <Row>
              <RadiusBtn icon="minus" onPress={() => setSearchRadius(searchRadiusKm - 5)} />
              <View style={{ flex: 1, height: 6, backgroundColor: colors.line, borderRadius: 3, marginHorizontal: 10 }}>
                <View style={{ height: 6, width: `${((searchRadiusKm - 5) / 95) * 100}%`, backgroundColor: colors.brand, borderRadius: 3 }} />
              </View>
              <RadiusBtn icon="plus" onPress={() => setSearchRadius(searchRadiusKm + 5)} />
            </Row>
          </View>

          {isOnline && !order && (
            <Sub style={{ marginTop: spacing.s }}>{t('driver.demoHint')}</Sub>
          )}
        </Card>
      </View>
    </View>
  );
};

const RadiusBtn: React.FC<{ icon: 'plus' | 'minus'; onPress: () => void }> = ({ icon, onPress }) => (
  <TouchableOpacity onPress={onPress}
    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
    <Feather name={icon} size={18} color={colors.brandDark} />
  </TouchableOpacity>
);
