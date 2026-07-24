import React from 'react';
import { View, Text, ScrollView, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Sub } from '@/components/UI';
import { FadeSlideIn } from '@/components/Anim';
import { useT } from '@/i18n';
import { colors, gradients, spacing, radius } from '@/theme';

const { width } = Dimensions.get('window');

export const RoleSelectScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Светлая шапка-«герой» с фирменным логотипом */}
      <LinearGradient colors={gradients.splash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: 80, paddingBottom: 48, paddingHorizontal: spacing.xl, borderBottomLeftRadius: radius.xl + 8, borderBottomRightRadius: radius.xl + 8, alignItems: 'center' }}>
        <FadeSlideIn>
          <Image source={require('../../../assets/brand/logo-light.png')} style={{ width: width * 0.6, height: width * 0.36 }} resizeMode="contain" />
          <Text style={{ color: colors.sub, marginTop: 4, fontSize: 15, textAlign: 'center', fontWeight: '600' }}>{t('role.title')}</Text>
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
