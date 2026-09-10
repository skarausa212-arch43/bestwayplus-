import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppMap, orderPoints } from '@/components/Map';
import { FadeSlideIn, Breathe } from '@/components/Anim';
import { Card, Button, H2, Sub, Row } from '@/components/UI';
import { GlassSheet, GlassBadge, Spark } from '@/components/Glass';
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
        <GlassBadge>
          <Feather name="credit-card" size={16} color={colors.ink} />
          <Text style={{ fontWeight: '800', color: colors.ink, marginLeft: 8, marginRight: 12 }}>{balance} zł</Text>
          <Feather name="star" size={15} color={colors.warn} />
          <Text style={{ color: colors.ink, fontWeight: '800', marginLeft: 4 }}>{rating}</Text>
        </GlassBadge>
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
            <Row style={{ marginBottom: 3 }}><Feather name="map-pin" size={14} color={colors.brandDark} /><Sub style={{ marginLeft: 8 }}>{order.pickup.full}</Sub></Row>
            {order.stops.map((s, i) => (
              <Row key={i} style={{ marginBottom: 3 }}><Feather name="circle" size={14} color={colors.sub} /><Sub style={{ marginLeft: 8 }}>{s.full}</Sub></Row>
            ))}
            <Row style={{ marginBottom: 3 }}><Feather name="flag" size={14} color={colors.ink} /><Sub style={{ marginLeft: 8 }}>{order.destination.full}</Sub></Row>
            <Row style={{ marginTop: 4 }}><Feather name="package" size={14} color={colors.brandDark} /><Sub style={{ marginLeft: 8 }}>{order.cargo.name} · {order.cargo.weightKg} kg · {order.distanceKm.toFixed(0)} km</Sub></Row>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.m, backgroundColor: colors.brandSoft, borderRadius: radius.m, padding: spacing.m }}>
              <Sub style={{ flex: 1, fontWeight: '700' }}>{t('driver.payout')}</Sub>
              <Text style={{ fontWeight: '900', fontSize: 24, color: colors.brandDark }}>{formatGr(payoutView?.totalGr ?? 0, 2)}</Text>
            </Row>
            <Row>
              <Button title={t('driver.reject')} variant="ghost" onPress={() => setOffer(null)} style={{ flex: 1, marginRight: 8 }} />
              <Button title={t('driver.accept')} onPress={accept} style={{ flex: 2 }} />
            </Row>
          </Card>
          </FadeSlideIn>
        </View>
      )}

      {!order && (
        <GlassSheet>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row>
                {isOnline && <Breathe><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand, marginRight: 8 }} /></Breathe>}
                <H2 style={{ fontSize: 20 }}>{isOnline ? t('driver.online') : t('driver.offline')}</H2>
              </Row>
              <Sub>{isOnline ? t('driver.onlineSub') : t('driver.offlineSub')}</Sub>
            </View>
            <Switch value={isOnline} onValueChange={setOnline} trackColor={{ true: colors.brand }} />
          </Row>

          {/* Познавательные слайды для водителя */}
          <TouchableOpacity onPress={() => navigation.navigate('InfoSlides', { set: 'driver', start: 0 })}
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, marginTop: spacing.s }}>
            <Feather name="help-circle" size={16} color={colors.brandDark} />
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>{t('dinfo.chip')}</Text>
          </TouchableOpacity>

          {/* Радиус приёма заказов: заказы вне круга водителю не приходят */}
          <View style={{ marginTop: spacing.m, backgroundColor: colors.card, borderRadius: radius.l, padding: spacing.m }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
              <Row>
                <Feather name="target" size={16} color={colors.brandDark} />
                <Sub style={{ marginLeft: 8, fontWeight: '800', color: colors.ink }}>{t('driver.radius')}</Sub>
              </Row>
              <Text style={{ fontWeight: '900', color: colors.brandDark, fontSize: 18 }}>{searchRadiusKm} km</Text>
            </Row>
            <Row>
              <RadiusBtn icon="minus" onPress={() => setSearchRadius(searchRadiusKm - 5)} />
              <View style={{ flex: 1, height: 8, backgroundColor: colors.line, borderRadius: 4, marginHorizontal: 12 }}>
                <View style={{ height: 8, width: `${((searchRadiusKm - 5) / 95) * 100}%`, backgroundColor: colors.brand, borderRadius: 4 }} />
              </View>
              <RadiusBtn icon="plus" onPress={() => setSearchRadius(searchRadiusKm + 5)} />
            </Row>
          </View>

          {/* Заработок за сегодня — мини-график */}
          <View style={{ marginTop: spacing.m, backgroundColor: colors.ink, borderRadius: radius.l, padding: spacing.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: '#9FB3C9', fontWeight: '700', fontSize: 13 }}>{t('earn.today')}</Text>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 26, letterSpacing: -1 }}>+248 zł</Text>
            </View>
            <View style={{ width: 120 }}><Spark data={[40, 65, 50, 80, 60, 95, 70]} height={44} /></View>
          </View>
        </GlassSheet>
      )}
    </View>
  );
};

const RadiusBtn: React.FC<{ icon: 'plus' | 'minus'; onPress: () => void }> = ({ icon, onPress }) => (
  <TouchableOpacity onPress={onPress}
    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
    <Feather name={icon} size={18} color={colors.brandDark} />
  </TouchableOpacity>
);
