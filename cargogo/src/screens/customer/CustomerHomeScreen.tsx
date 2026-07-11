import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MockMap } from '@/components/MockMap';
import { Card, Button, H2, Sub, Row } from '@/components/UI';
import { NotificationBell } from '@/components/NotificationBell';
import { useOrderStore } from '@/store/orders';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

export const CustomerHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const active = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MockMap height={999} style={{ borderRadius: 0, flex: 1 }} showRoute={!!active} />
      <View style={{ position: 'absolute', top: 54, right: 16 }}><NotificationBell navigation={navigation} /></View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.l }}>
        {active ? (
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
              <H2>{t('home.activeOrder')}</H2>
              <Text style={{ color: colors.brand, fontWeight: '800' }}>{active.price.total} zł</Text>
            </Row>
            <Sub style={{ marginBottom: spacing.m }}>{t(`status.${active.status}`)}</Sub>
            <Button title={t('home.details')} onPress={() => navigation.navigate('ActiveOrder')} />
          </Card>
        ) : (
          <Card>
            <H2 style={{ marginBottom: spacing.m }}>{t('home.whatToMove')}</H2>
            <TouchableOpacity onPress={() => navigation.navigate('OrderWizard')}
              style={{ backgroundColor: '#F8F9FB', borderRadius: radius.m, padding: 14, marginBottom: spacing.s }}>
              <Text style={{ color: colors.faint }}>📍 {t('home.from')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('OrderWizard')}
              style={{ backgroundColor: '#F8F9FB', borderRadius: radius.m, padding: 14, marginBottom: spacing.m }}>
              <Text style={{ color: colors.faint }}>🏁 {t('home.to')}</Text>
            </TouchableOpacity>
            <Button title={t('home.order')} onPress={() => navigation.navigate('OrderWizard')} />
          </Card>
        )}
      </View>
    </View>
  );
};
