import React from 'react';
import { View, Text } from 'react-native';
import { Button, Card, H1, Sub } from '@/components/UI';
import { t } from '@/i18n';
import { colors, spacing } from '@/theme';

export const RoleSelectScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
    <Text style={{ fontSize: 44, textAlign: 'center', marginBottom: spacing.l }}>🚚</Text>
    <H1 style={{ textAlign: 'center', marginBottom: spacing.xxl }}>{t('role.title')}</H1>
    <Card style={{ marginBottom: spacing.m }}>
      <Text style={{ fontSize: 28, marginBottom: 8 }}>📦</Text>
      <Sub style={{ marginBottom: spacing.m }}>Przewieziesz meble, AGD, palety lub auto — szybko i bezpiecznie.</Sub>
      <Button title={t('role.customer')} onPress={() => navigation.navigate('CustomerAuth')} />
    </Card>
    <Card>
      <Text style={{ fontSize: 28, marginBottom: 8 }}>🧑‍✈️</Text>
      <Sub style={{ marginBottom: spacing.m }}>Masz busa lub lawetę? Zarabiaj na zleceniach w Twojej okolicy.</Sub>
      <Button title={t('role.driver')} variant="secondary" onPress={() => navigation.navigate('DriverAuth')} />
    </Card>
  </View>
);
