import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppMap, orderPoints } from '@/components/Map';
import { FadeSlideIn } from '@/components/Anim';
import { Button, H1, H2, Sub, Row } from '@/components/UI';
import { GlassSheet, GlassBadge } from '@/components/Glass';
import { NotificationBell } from '@/components/NotificationBell';
import { useOrderStore } from '@/store/orders';
import { usePricingStore } from '@/features/pricing/pricingService';
import { getScenario } from '@/features/pricing/pricingMocks';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const CustomerHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const active = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  // Машинки онлайн вокруг клиента — из текущего сценария доступности
  const demandScenarioId = usePricingStore((s) => s.demandScenarioId);
  const onlineDrivers = getScenario(demandScenarioId).drivers;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppMap height={999} style={{ borderRadius: 0, flex: 1 }} showRoute={!!active} points={orderPoints(active)}
        onlineDrivers={active ? undefined : onlineDrivers} />
      <View style={{ position: 'absolute', top: 54, right: 16 }}><NotificationBell navigation={navigation} /></View>
      {!active && onlineDrivers.length > 0 && (
        <View style={{ position: 'absolute', top: 56, left: 16 }}>
          <GlassBadge>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, marginRight: 8 }} />
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13 }}>{t('map.online', [onlineDrivers.length])}</Text>
          </GlassBadge>
        </View>
      )}

      {active ? (
        <FadeSlideIn>
          <GlassSheet>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
              <H2>{t('home.activeOrder')}</H2>
              <Text style={{ color: colors.brandDark, fontWeight: '900', fontSize: 20 }}>{active.price.total} zł</Text>
            </Row>
            <Sub style={{ marginBottom: spacing.m }}>{t(`status.${active.status}`)}</Sub>
            <Button title={t('home.details')} onPress={() => navigation.navigate('ActiveOrder')} />
          </GlassSheet>
        </FadeSlideIn>
      ) : (
        <FadeSlideIn>
          <GlassSheet style={{ paddingBottom: 0 }}>
            <View style={{ paddingBottom: 96 }}>
              <H1 style={{ marginBottom: 4 }}>{t('home.whatToMove')}</H1>
              <Sub style={{ marginBottom: spacing.l }}>{t('map.online', [onlineDrivers.length])}</Sub>
              <TouchableOpacity onPress={() => navigation.navigate('OrderWizard')}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F4F7', borderRadius: 18, padding: 16, marginBottom: 10 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand, marginRight: 12 }} />
                <Text style={{ color: colors.faint, fontSize: 15, fontWeight: '600' }}>{t('home.from')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('OrderWizard')}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F4F7', borderRadius: 18, padding: 16, marginBottom: spacing.l }}>
                <Feather name="flag" size={16} color={colors.ink} style={{ marginRight: 12 }} />
                <Text style={{ color: colors.faint, fontSize: 15, fontWeight: '600' }}>{t('home.to')}</Text>
              </TouchableOpacity>
              <Button title={t('home.order')} onPress={() => navigation.navigate('OrderWizard')} />
            </View>
          </GlassSheet>
        </FadeSlideIn>
      )}
    </View>
  );
};
