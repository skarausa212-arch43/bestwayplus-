import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Sub } from '@/components/UI';
import { FadeSlideIn } from '@/components/Anim';
import { useT } from '@/i18n';
import { APP_CONFIG } from '@/config/app';
import { colors, gradients, spacing, radius } from '@/theme';

export const RoleSelectScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Градиентная шапка-«герой» */}
      <LinearGradient colors={gradients.splash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: 90, paddingBottom: 56, paddingHorizontal: spacing.xl, borderBottomLeftRadius: radius.xl + 8, borderBottomRightRadius: radius.xl + 8 }}>
        <FadeSlideIn>
          <Text style={{ fontSize: 46 }}>🚚</Text>
          <Text style={{ fontSize: 32, fontWeight: '900', color: '#FFF', letterSpacing: -1, marginTop: 8 }}>{APP_CONFIG.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 6, fontSize: 15 }}>{t('role.title')}</Text>
        </FadeSlideIn>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.xl }}>
        <FadeSlideIn delay={120}>
          <Card style={{ marginBottom: spacing.m }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Feather name="package" size={26} color={colors.brandDark} /></View>
            <Sub style={{ marginBottom: spacing.m }}>Przewieziesz meble, AGD, palety lub auto — szybko i bezpiecznie.</Sub>
            <Button title={t('role.customer')} onPress={() => navigation.navigate('CustomerAuth')} />
          </Card>
        </FadeSlideIn>
        <FadeSlideIn delay={240}>
          <Card>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Feather name="truck" size={26} color={colors.info} /></View>
            <Sub style={{ marginBottom: spacing.m }}>Masz busa lub lawetę? Zarabiaj na zleceniach w Twojej okolicy.</Sub>
            <Button title={t('role.driver')} variant="secondary" onPress={() => navigation.navigate('DriverAuth')} />
          </Card>
        </FadeSlideIn>
      </ScrollView>
    </View>
  );
};
