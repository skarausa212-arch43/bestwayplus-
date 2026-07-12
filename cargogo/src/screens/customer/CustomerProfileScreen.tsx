import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Card, Button, H2, Sub, Row } from '@/components/UI';
import { LangSwitcher } from '@/components/LangSwitcher';
import { useAuthStore } from '@/store/auth';
import { useCommunityStore } from '@/store/community';
import { MOCK_CUSTOMER_PROFILE } from '@/mocks';
import { useT } from '@/i18n';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/theme';

export const CustomerProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const { user, logout } = useAuthStore();
  const rating = useCommunityStore((s) => s.customerRating);
  const ratingCount = useCommunityStore((s) => s.customerRatingCount);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <Card style={{ marginBottom: spacing.m, alignItems: 'center' }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Feather name="user" size={36} color="#FFF" /></View>
        <H2>{user?.firstName} {user?.lastName}</H2>
        <Sub>{user?.email} · {user?.phone}</Sub>
        {/* Рейтинг клиента (оценки в обе стороны) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.warnSoft, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginTop: 10 }}>
          <Feather name="star" size={16} color={colors.warn} />
          <Text style={{ fontWeight: '800', color: colors.ink, marginLeft: 6 }}>{rating.toFixed(1)}</Text>
          <Text style={{ color: colors.sub, marginLeft: 6, fontSize: 12 }}>· {t('profile.rating')} ({ratingCount})</Text>
        </View>
      </Card>
      <Card style={{ marginBottom: spacing.m }}>
        <LangSwitcher />
      </Card>
      <Card style={{ marginBottom: spacing.m }}>
        <H2 style={{ fontSize: 16, marginBottom: spacing.s }}>{t('profile.addresses')}</H2>
        <Row style={{ marginBottom: 6 }}><Sub>🏠 {t('profile.home')}: {MOCK_CUSTOMER_PROFILE.homeAddress?.full}</Sub></Row>
        <Row><Sub>💼 {t('profile.work')}: {MOCK_CUSTOMER_PROFILE.workAddress?.full}</Sub></Row>
      </Card>
      <Card style={{ marginBottom: spacing.m }}>
        <H2 style={{ fontSize: 16, marginBottom: spacing.s }}>{t('profile.payments')}</H2>
        {MOCK_CUSTOMER_PROFILE.paymentMethods.map((pm) => <Sub key={pm.id} style={{ marginBottom: 4 }}>💳 {pm.label}</Sub>)}
      </Card>
      <Button title={t('profile.logout')} variant="danger" onPress={() => { logout(); navigation.reset({ index: 0, routes: [{ name: 'RoleSelect' }] }); }} />
    </ScrollView>
  );
};
