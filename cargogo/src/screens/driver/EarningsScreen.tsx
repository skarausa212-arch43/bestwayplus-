import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { Card, H2, Sub, Row, Button } from '@/components/UI';
import { useDriverStore } from '@/store/driver';
import { notify } from '@/services/notifications';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const EarningsScreen: React.FC = () => {
  const t = useT();
  const { balance, earnings } = useDriverStore();
  const today = earnings.filter((e) => new Date(e.at).toDateString() === new Date().toDateString());
  const sumToday = today.reduce((s, e) => s + e.net, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.l, paddingTop: 60 }}>
      <H2 style={{ marginBottom: spacing.l }}>{t('earn.title')}</H2>
      <Card style={{ marginBottom: spacing.m }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View><Sub>{t('earn.available')}</Sub><Text style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{balance} zł</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Sub>{t('earn.today')}</Sub><Text style={{ fontSize: 20, fontWeight: '800', color: colors.brand }}>+{sumToday} zł</Text></View>
        </Row>
        <Button title={t('earn.payout')} variant="secondary" style={{ marginTop: spacing.m }}
          onPress={() => notify('driver', 'n.payout', 'n.payoutB', [balance])} />
      </Card>
      <FlatList data={earnings} keyExtractor={(e) => e.orderId + e.at}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.s }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{t('earn.order')} {item.orderId.slice(-6)}</Text>
                <Sub>{item.gross} zł − {t('earn.commission')} {item.commission} zł{item.tip ? ` + ${t('earn.tip')} ${item.tip} zł` : ''}</Sub>
              </View>
              <Text style={{ fontWeight: '900', color: colors.brand, fontSize: 17 }}>+{item.net} zł</Text>
            </Row>
          </Card>
        )} />
    </View>
  );
};
