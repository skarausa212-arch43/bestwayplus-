import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, H1, Sub, Row, Button } from '@/components/UI';
import { PriceHero, Spark } from '@/components/Glass';
import { useDriverStore } from '@/store/driver';
import { notify } from '@/services/notifications';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const EarningsScreen: React.FC = () => {
  const t = useT();
  const { balance, earnings } = useDriverStore();
  const today = earnings.filter((e) => new Date(e.at).toDateString() === new Date().toDateString());
  const sumToday = Math.round(today.reduce((s, e) => s + e.payout + e.tip, 0) * 100) / 100;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.l, paddingTop: 60 }}>
      <H1 style={{ marginBottom: spacing.l }}>{t('earn.title')}</H1>
      <PriceHero
        label={t('earn.available')} amount={String(balance)} badge={`${t('earn.today')} +${sumToday} zł`}
        style={{ marginBottom: spacing.m }}
      />
      <View style={{ marginBottom: spacing.m }}>
        <Card style={{ marginBottom: spacing.m }}>
          <Sub style={{ marginBottom: spacing.s, fontWeight: '700' }}>{t('earn.title')} · 7</Sub>
          <Spark data={[35, 55, 45, 70, 50, 85, 62]} height={56} />
        </Card>
        <Button title={t('earn.payout')} variant="secondary"
          onPress={() => notify('driver', 'n.payout', 'n.payoutB', [balance])} />
      </View>
      <FlatList data={earnings} keyExtractor={(e) => e.orderId + e.at}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.s }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Feather name="check" size={20} color={colors.brandDark} />
                </View>
                <View>
                  <Text style={{ fontWeight: '800', color: colors.ink }}>{t('earn.order')} {item.orderId.slice(-6)}</Text>
                  <Sub>{t('driver.payout')}: {item.payout.toFixed(2)} zł{item.tip ? ` + ${t('earn.tip')} ${item.tip} zł` : ''}</Sub>
                </View>
              </Row>
              <Text style={{ fontWeight: '900', color: colors.brandDark, fontSize: 17 }}>+{(item.payout + item.tip).toFixed(2)} zł</Text>
            </Row>
          </Card>
        )} />
    </View>
  );
};
