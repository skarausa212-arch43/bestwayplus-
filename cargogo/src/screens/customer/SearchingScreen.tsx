import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { AppMap, orderPoints } from '@/components/Map';
import { Button, H2, Sub } from '@/components/UI';
import { GlassSheet } from '@/components/Glass';
import { FadeSlideIn } from '@/components/Anim';
import { useOrderStore } from '@/store/orders';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const SearchingScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const order = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  const assignDriver = useOrderStore((s) => s.assignDriver);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);
  const shimmer = useRef(new Animated.Value(0)).current;

  // Бесконечный «бегущий» индикатор поиска
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ).start();
  }, []);

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
      <AppMap height={999} style={{ borderRadius: 0, flex: 1 }} searching points={orderPoints(order)} showRoute />
      <FadeSlideIn>
        <GlassSheet>
          <H2 style={{ marginBottom: 4 }}>{t('order.searching')}</H2>
          <Sub style={{ marginBottom: spacing.m }}>
            {order.pickup.full} → {order.destination.full} · {order.price.total} zł
          </Sub>
          <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3, marginBottom: spacing.l, overflow: 'hidden' }}>
            <Animated.View style={{
              height: 6, width: '38%', backgroundColor: colors.brand, borderRadius: 3,
              transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-140, 320] }) }],
            }} />
          </View>
          <Button title={t('order.cancel')} variant="ghost" onPress={() => { cancelOrder(order.id, 'customer'); navigation.goBack(); }} />
        </GlassSheet>
      </FadeSlideIn>
    </View>
  );
};
