import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Card, Button, H2, Sub, Row } from '@/components/UI';
import { LangSwitcher } from '@/components/LangSwitcher';
import { useAuthStore } from '@/store/auth';
import { MOCK_CUSTOMER_PROFILE } from '@/mocks';
import { useT } from '@/i18n';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

export const CustomerProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const { user, logout } = useAuthStore();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <Card style={{ marginBottom: spacing.m, alignItems: 'center' }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Feather name="user" size={36} color={colors.brandDark} /></View>
        <H2>{user?.firstName} {user?.lastName}</H2>
        <Sub>{user?.email} · {user?.phone}</Sub>
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
