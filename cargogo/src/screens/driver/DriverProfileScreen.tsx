import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { Card, Button, H2, Sub, Row, StatusPill } from '@/components/UI';
import { LangSwitcher } from '@/components/LangSwitcher';
import { useAuthStore } from '@/store/auth';
import { useDriverStore } from '@/store/driver';
import { useT } from '@/i18n';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

const SECTIONS = ['Dane osobowe', 'Dokument tożsamości', 'Prawo jazdy', 'Pojazdy', 'Dokumenty pojazdu', 'Dane do wypłat', 'Obszar pracy', 'Oceny', 'Pomoc', 'Regulamin'];

export const DriverProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const { user, logout } = useAuthStore();
  const { rating, totalOrders, vehicle } = useDriverStore();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <Card style={{ marginBottom: spacing.m, alignItems: 'center' }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Feather name="truck" size={34} color={colors.info} /></View>
        <H2>{user?.firstName} {user?.lastName}</H2>
        <Sub>★ {rating} · {totalOrders}</Sub>
      </Card>
      <Card style={{ marginBottom: spacing.m }}>
        <LangSwitcher />
      </Card>
      <Card style={{ marginBottom: spacing.m }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{vehicle.brand} {vehicle.model}</Text>
          <StatusPill label="Zatwierdzony" />
        </Row>
        <Sub>{vehicle.registrationNumber} · {vehicle.dimensions.length}×{vehicle.dimensions.width}×{vehicle.dimensions.height} m · {vehicle.payload} kg</Sub>
        <Sub style={{ marginTop: 4 }}>OC ważne do 03.2027 · Badanie do 11.2026</Sub>
      </Card>
      <Card style={{ marginBottom: spacing.m }}>
        {SECTIONS.map((s2, i) => (
          <View key={s2} style={{ paddingVertical: 10, borderBottomWidth: i < SECTIONS.length - 1 ? 1 : 0, borderColor: colors.line }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{s2}  ›</Text>
          </View>
        ))}
      </Card>
      <Button title={t('profile.logout')} variant="danger" onPress={() => { logout(); navigation.reset({ index: 0, routes: [{ name: 'RoleSelect' }] }); }} />
    </ScrollView>
  );
};
