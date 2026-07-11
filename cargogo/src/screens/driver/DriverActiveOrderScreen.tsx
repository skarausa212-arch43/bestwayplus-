import React, { useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { AppMap, orderPoints } from '@/components/Map';
import { ProgressBar } from '@/components/Anim';
import { WaitBanner } from '@/components/WaitBanner';
import { Card, Button, H2, Sub, Row, StatusPill, Input } from '@/components/UI';
import { useOrderStore } from '@/store/orders';
import { useDriverStore } from '@/store/driver';
import { DRIVER_STATUS_FLOW } from '@/constants';
import { OrderStatus } from '@/types';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

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

export const DriverActiveOrderScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
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
  const [prReason, setPrReason] = useState('');

  if (!order) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Sub>{t('driver.noActive')}</Sub>
    </View>
  );

  const next = NEXT[order.status];
  const progress = Math.max(0, DRIVER_STATUS_FLOW.indexOf(order.status)) / (DRIVER_STATUS_FLOW.length - 1);
  const canProposePrice = !['completed', 'cancelled', 'awaiting_payment', 'searching'].includes(order.status);

  const confirmCode = () => {
    if (completeWithCode(order.id, code.trim())) {
      addEarning(order.id, order.price.total);
      Alert.alert(t('code.doneTitle'), t('code.done'));
      navigation.goBack();
    } else {
      Alert.alert(t('common.error'), t('code.bad'));
    }
  };

  const submitPriceReq = () => {
    const amount = parseInt(prAmount, 10);
    if (!amount || amount <= 0) return Alert.alert(t('common.error'), t('pr.amount'));
    sendPriceReq(amount, prReason);
    setShowPrForm(false);
    setPrAmount('');
    setPrReason('');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <AppMap height={200} showRoute driverProgress={progress} points={orderPoints(order)} style={{ marginBottom: spacing.m }} />
      <Card style={{ marginBottom: spacing.m }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
          <StatusPill label={t(`status.${order.status}`)} tone="info" />
          <Text style={{ fontWeight: '900', fontSize: 20, color: colors.ink }}>{order.price.total} zł</Text>
        </Row>
        <ProgressBar progress={order.status === 'completed' ? 1 : progress} style={{ marginBottom: spacing.s }} />
        <Sub>📍 {order.pickup.full}</Sub>
        {order.stops.map((s, i) => (
          <Sub key={i}>🔸 {s.full}</Sub>
        ))}
        <Sub>🏁 {order.destination.full}</Sub>
        <Sub style={{ marginTop: 4 }}>📦 {order.cargo.name} · {order.cargo.weightKg} kg</Sub>
        <Row style={{ marginTop: spacing.m }}>
          <Button title={t('driver.chat')} variant="secondary" onPress={() => navigation.navigate('DriverChat')} style={{ flex: 1, marginRight: 8 }} />
          <Button title={t('driver.nav')} variant="secondary" onPress={() => Alert.alert(t('nav.title'), t('nav.body'))} style={{ flex: 1 }} />
        </Row>
      </Card>

      <WaitBanner />

      {next && (
        <Button title={t(`a.${next}`)} onPress={() => setStatus(order.id, next)} style={{ marginBottom: spacing.s }} />
      )}

      {/* §37 — запрос изменения цены: форма (сумма + причина) / ожидание решения клиента */}
      {canProposePrice && (
        priceReq && priceReq.orderId === order.id ? (
          <Card style={{ marginBottom: spacing.s }}>
            <Sub>{t('pr.pending')}</Sub>
          </Card>
        ) : showPrForm ? (
          <Card style={{ marginBottom: spacing.s }}>
            <Input label={t('pr.amount')} value={prAmount} onChangeText={setPrAmount} keyboardType="numeric" placeholder={String(order.price.total + 20)} />
            <Input label={t('pr.reason')} value={prReason} onChangeText={setPrReason} placeholder={t('pr.reason')} />
            <Button title={t('pr.send')} onPress={submitPriceReq} />
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
    </ScrollView>
  );
};
