import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppMap, orderPoints } from '@/components/Map';
import { ProgressBar } from '@/components/Anim';
import { WaitBanner } from '@/components/WaitBanner';
import { BackButton } from '@/components/BackButton';
import { Card, Button, H2, Sub, Row, StatusPill, Input } from '@/components/UI';
import { Timeline } from '@/components/Glass';
import { useOrderStore } from '@/store/orders';
import { useDriverStore } from '@/store/driver';
import { DRIVER_STATUS_FLOW } from '@/constants';
import { OrderStatus } from '@/types';
import { getDriverPricingView } from '@/features/pricing/pricingSelectors';
import { formatGr } from '@/features/pricing/pricingHelpers';
import { PriceChangeReason } from '@/features/pricing/pricingTypes';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

// Порядок ручных переключений статусов водителем (раздел 35 ТЗ); подписи — ключи a.*
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted: 'driver_en_route',
  driver_en_route: 'driver_arrived',
  driver_arrived: 'loading',
  loading: 'in_transit',
  in_transit: 'arrived_destination',
  arrived_destination: 'unloading',
  unloading: 'awaiting_confirmation',
};

// Типовые причины доплаты (§13) — ключи prr.*
const PRICE_REASONS: PriceChangeReason[] = [
  'bigger_cargo', 'heavier_cargo', 'extra_loading', 'no_elevator',
  'restricted_access', 'extra_stop', 'waiting_exceeded', 'wrong_info',
];

export const DriverActiveOrderScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const t = useT();
  const order = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  const setStatus = useOrderStore((s) => s.setStatus);
  const completeWithCode = useOrderStore((s) => s.completeWithCode);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);
  const priceReq = useOrderStore((s) => s.priceReq);
  const sendPriceReq = useOrderStore((s) => s.sendPriceReq);
  const addEarning = useDriverStore((s) => s.addEarning);
  const [code, setCode] = useState('');
  const [showPrForm, setShowPrForm] = useState(false);
  const [prAmount, setPrAmount] = useState('');
  const [prReason, setPrReason] = useState<PriceChangeReason>('bigger_cargo');

  if (!order) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Sub>{t('driver.noActive')}</Sub>
    </View>
  );

  const next = NEXT[order.status];
  const progress = Math.max(0, DRIVER_STATUS_FLOW.indexOf(order.status)) / (DRIVER_STATUS_FLOW.length - 1);
  const canProposePrice = !['completed', 'cancelled', 'awaiting_payment', 'searching'].includes(order.status);

  // §8: водитель видит ТОЛЬКО свою выплату — цена клиента ему недоступна
  const payout = order.pricing ? getDriverPricingView(order.pricing) : null;
  const payoutPln = payout ? payout.totalGr / 100 : 0;

  const confirmCode = () => {
    if (completeWithCode(order.id, code.trim())) {
      addEarning(order.id, payoutPln);
      // Водитель оценивает клиента (оценки в обе стороны)
      navigation.replace('RateOrder', { orderId: order.id, target: 'customer' });
    } else {
      Alert.alert(t('common.error'), t('code.bad'));
    }
  };

  const submitPriceReq = () => {
    const amountPln = parseInt(prAmount, 10);
    if (!amountPln || amountPln <= 0) return Alert.alert(t('common.error'), t('pr.amount'));
    sendPriceReq(amountPln * 100, prReason); // грощи
    setShowPrForm(false);
    setPrAmount('');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <AppMap height={200} showRoute driverProgress={progress} points={orderPoints(order)} style={{ marginBottom: spacing.m }} />
      {route?.name === 'DriverActiveOrder' && <BackButton navigation={navigation} style={{ top: 70, left: 28 }} />}
      <Card style={{ marginBottom: spacing.m }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
          <StatusPill label={t(`status.${order.status}`)} tone="info" />
          {/* Выплата водителю (нетто), НЕ цена клиента */}
          <View style={{ alignItems: 'flex-end' }}>
            <Sub style={{ fontSize: 11 }}>{t('driver.payout')}</Sub>
            <Text style={{ fontWeight: '900', fontSize: 20, color: colors.brandDark }}>{formatGr(payout?.totalGr ?? 0, 2)}</Text>
          </View>
        </Row>
        <ProgressBar progress={order.status === 'completed' ? 1 : progress} style={{ marginBottom: spacing.m }} />
        <Timeline points={[
          { title: order.pickup.full, sub: t('details.route'), done: progress > 0.4 },
          ...order.stops.map((s) => ({ title: s.full, sub: undefined as string | undefined, done: progress > 0.4 })),
          { title: order.destination.full, sub: `${order.cargo.name} · ${order.cargo.weightKg} kg`, done: order.status === 'completed' },
        ]} />
        <Row style={{ marginTop: spacing.m }}>
          <Button title={t('driver.chat')} variant="secondary" onPress={() => navigation.navigate('DriverChat')} style={{ flex: 1, marginRight: 8 }} />
          <Button title={t('driver.nav')} variant="secondary" onPress={() => Alert.alert(t('nav.title'), t('nav.body'))} style={{ flex: 1 }} />
        </Row>
      </Card>

      <WaitBanner />

      {next && (
        <Button title={t(`a.${next}`)} onPress={() => setStatus(order.id, next)} style={{ marginBottom: spacing.s }} />
      )}

      {/* §37/§13 — запрос доплаты: сумма + типовая причина / ожидание решения клиента */}
      {canProposePrice && (
        priceReq && priceReq.orderId === order.id ? (
          <Card style={{ marginBottom: spacing.s }}>
            <Sub>{t('pr.pending')}</Sub>
          </Card>
        ) : showPrForm ? (
          <Card style={{ marginBottom: spacing.s }}>
            <Input label={t('pr.amount')} value={prAmount} onChangeText={setPrAmount} keyboardType="numeric" placeholder="20" />
            <Sub style={{ marginBottom: 6, fontWeight: '600' }}>{t('prr.pickReason')}</Sub>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.m }}>
              {PRICE_REASONS.map((r) => (
                <TouchableOpacity key={r} onPress={() => setPrReason(r)}
                  style={{ backgroundColor: prReason === r ? colors.brand : colors.surface, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7, margin: 3 }}>
                  <Text style={{ color: prReason === r ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{t(`prr.${r}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Row>
              <Button title={t('common.back')} variant="ghost" onPress={() => setShowPrForm(false)} style={{ flex: 1, marginRight: 8 }} />
              <Button title={t('pr.send')} onPress={submitPriceReq} style={{ flex: 2 }} />
            </Row>
          </Card>
        ) : (
          <Button title={t('pr.btn')} variant="secondary" onPress={() => setShowPrForm(true)} style={{ marginBottom: spacing.s }} />
        )
      )}

      {order.status === 'awaiting_confirmation' && (
        <Card style={{ marginBottom: spacing.s }}>
          <H2 style={{ fontSize: 16, marginBottom: spacing.s }}>{t('code.from')}</H2>
          <Input value={code} onChangeText={setCode} keyboardType="numeric" placeholder={t('ph.code')} />
          <Button title={t('code.finish')} onPress={confirmCode} />
        </Card>
      )}
      {order.status !== 'completed' && (
        <Button title={t('order.cancel')} variant="ghost" onPress={() => { cancelOrder(order.id, 'driver'); navigation.goBack(); }} />
      )}

      {/* «Проблема с заказом» — доступно и водителю */}
      <TouchableOpacity onPress={() => navigation.navigate('ReportProblem', { orderId: order.id })}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.m, paddingVertical: spacing.s }}>
        <Feather name="alert-triangle" size={16} color={colors.warn} />
        <Text style={{ color: colors.warn, fontWeight: '800', marginLeft: 8 }}>{t('rep.btn')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
