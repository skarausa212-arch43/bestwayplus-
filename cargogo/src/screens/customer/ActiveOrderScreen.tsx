import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { AppMap, orderPoints } from '@/components/Map';
import { ProgressBar } from '@/components/Anim';
import { WaitBanner } from '@/components/WaitBanner';
import { BackButton } from '@/components/BackButton';
import { Feather } from '@expo/vector-icons';
import { FadeSlideIn, AnimatedNumber } from '@/components/Anim';
import { Card, Button, Sub, Row, StatusPill } from '@/components/UI';
import { Timeline, IconBtn } from '@/components/Glass';
import { useOrderStore } from '@/store/orders';
import { useDriverStore } from '@/store/driver';
import { DRIVER_STATUS_FLOW } from '@/constants';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const ActiveOrderScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const order = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  const cancelOrder = useOrderStore((s) => s.cancelOrder);
  const priceReq = useOrderStore((s) => s.priceReq);
  const answerPriceReq = useOrderStore((s) => s.answerPriceReq);
  const vehicle = useDriverStore((s) => s.vehicle);

  if (!order) return null;
  const progress = Math.max(0, DRIVER_STATUS_FLOW.indexOf(order.status)) / (DRIVER_STATUS_FLOW.length - 1);
  const done = order.status === 'completed';
  const pickedUp = ['in_transit', 'arrived_destination', 'unloading', 'awaiting_confirmation', 'completed'].includes(order.status);

  const routePoints = [
    { title: order.pickup.full, sub: t('details.route'), done: pickedUp },
    ...order.stops.map((s) => ({ title: s.full, sub: undefined as string | undefined, done: pickedUp })),
    { title: order.destination.full, sub: done ? t('status.completed') : undefined, done },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <AppMap height={230} showRoute driverProgress={progress} points={orderPoints(order)} style={{ marginBottom: spacing.m }} />
      <BackButton navigation={navigation} style={{ top: 70, left: 28 }} />
      <Card style={{ marginBottom: spacing.m }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
          <StatusPill label={t(`status.${order.status}`)} tone={done ? 'brand' : 'info'} />
          <AnimatedNumber value={order.price.total} textStyle={{ fontWeight: '900', fontSize: 20, color: colors.ink }} />
        </Row>
        <ProgressBar progress={done ? 1 : progress} style={{ marginBottom: spacing.m }} />
        <Timeline points={routePoints} />
        {order.status === 'awaiting_confirmation' && (
          <View style={{ backgroundColor: colors.warnSoft, borderRadius: 12, padding: spacing.m, marginTop: spacing.m }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{t('code.for')}</Text>
            <Text style={{ fontSize: 32, fontWeight: '900', letterSpacing: 8, color: colors.warn }}>{order.confirmationCode}</Text>
          </View>
        )}
      </Card>

      <WaitBanner />

      {/* §37 — карточка предложения новой цены: принять / отклонить */}
      {priceReq && priceReq.orderId === order.id && (
        <FadeSlideIn>
        <Card style={{ marginBottom: spacing.m, borderWidth: 2, borderColor: colors.info }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{t('pr.title')}</Text>
          <Row style={{ justifyContent: 'space-between', marginVertical: spacing.s }}>
            <Sub style={{ flex: 1, marginRight: 8 }}>{t(`prr.${priceReq.reason}`)}{priceReq.comment ? ` · ${priceReq.comment}` : ''}</Sub>
            <Text style={{ fontWeight: '900', fontSize: 20, color: colors.info }}>+{Math.round(priceReq.amountGr / 100)} zł</Text>
          </Row>
          <Row>
            <Button title={t('pr.decline')} variant="ghost" onPress={() => answerPriceReq(false)} style={{ flex: 1, marginRight: 8 }} />
            <Button title={t('pr.accept')} onPress={() => answerPriceReq(true)} style={{ flex: 2 }} />
          </Row>
        </Card>
        </FadeSlideIn>
      )}

      {order.driverId && (
        <Card style={{ marginBottom: spacing.m }}>
          <Row>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginRight: spacing.m }}>
              <Feather name="user" size={24} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>Marek K.</Text>
              <Row style={{ marginTop: 1 }}>
                <Feather name="star" size={13} color={colors.warn} />
                <Sub style={{ marginLeft: 4 }}>4.9 · {vehicle.brand} {vehicle.model}</Sub>
              </Row>
            </View>
            <IconBtn icon="message-circle" bg={colors.brandSoft} fg={colors.brandDark} onPress={() => navigation.navigate('Chat')} style={{ marginRight: 8 }} />
            <IconBtn icon="phone" bg={colors.brand} fg="#FFF" onPress={() => Alert.alert(t('call.title'), t('call.body'))} />
          </Row>
        </Card>
      )}
      {done
        ? <Button title={t('rate.rate')} onPress={() => navigation.replace('RateOrder', { orderId: order.id, target: 'driver' })} />
        : <Button title={t('order.cancel')} variant="ghost" onPress={() => { cancelOrder(order.id, 'customer'); navigation.goBack(); }} />}

      {/* «Проблема с заказом» — доступно клиенту в любой момент */}
      <TouchableOpacity onPress={() => navigation.navigate('ReportProblem', { orderId: order.id })}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.m, paddingVertical: spacing.s }}>
        <Feather name="alert-triangle" size={16} color={colors.warn} />
        <Text style={{ color: colors.warn, fontWeight: '800', marginLeft: 8 }}>{t('rep.btn')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
