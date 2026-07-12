import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Image, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/UI';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

const { width } = Dimensions.get('window');

// Познавательные слайды (сториз-стиль, как в референсе Яндекс Go «Грузовой»)
// set='customer' — о доставке/кузове/грузчиках/ожидании; set='driver' — как зарабатывать
type Slide = { prefix: 'info' | 'dinfo'; key: string; illustration: React.ReactNode };

const vanSmall = require('../../../assets/vehicles/van-small.png');

// Иллюстрация: иконка в мягком градиентном круге (аккуратно, «премиально»)
const Hero: React.FC<{ name: React.ComponentProps<typeof Feather>['name']; from: string; to: string; fg: string }> = ({ name, from, to, fg }) => (
  <View style={{ width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center' }}>
    <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90 }} />
    <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B1220', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
      <Feather name={name} size={64} color={fg} />
    </View>
  </View>
);

export const InfoSlidesScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const t = useT();
  const set: 'customer' | 'driver' = route?.params?.set ?? 'customer';
  const start: number = route?.params?.start ?? 0;

  const customerSlides: Slide[] = [
    { prefix: 'info', key: 'delivery', illustration: (
      <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.l, alignItems: 'center', width: width * 0.72, shadowColor: '#0B1220', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}>
        <Image source={vanSmall} style={{ width: width * 0.56, height: width * 0.36 }} resizeMode="contain" />
      </View>
    ) },
    { prefix: 'info', key: 'body', illustration: (
      <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.l, alignItems: 'center', width: width * 0.72 }}>
        <Image source={vanSmall} style={{ width: width * 0.5, height: width * 0.32 }} resizeMode="contain" />
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.m, padding: 5, marginTop: spacing.m }}>
          {['S', 'M', 'L'].map((s, i) => (
            <View key={s} style={{ paddingHorizontal: 22, paddingVertical: 8, borderRadius: radius.s, backgroundColor: i === 0 ? colors.card : 'transparent' }}>
              <Text style={{ fontWeight: '800', color: i === 0 ? colors.ink : colors.faint }}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
    ) },
    { prefix: 'info', key: 'loaders', illustration: <Hero name="users" from="#E2F8F9" to="#C7F1F4" fg={colors.brandDark} /> },
    { prefix: 'info', key: 'waiting', illustration: <Hero name="clock" from="#FFF4E0" to="#FDE7BE" fg={colors.warn} /> },
  ];

  const driverSlides: Slide[] = [
    { prefix: 'dinfo', key: 'earn', illustration: <Hero name="trending-up" from="#E2F8F9" to="#C7F1F4" fg={colors.brandDark} /> },
    { prefix: 'dinfo', key: 'radius', illustration: <Hero name="target" from="#EAF1FF" to="#D6E4FF" fg={colors.info} /> },
    { prefix: 'dinfo', key: 'verify', illustration: <Hero name="shield" from="#E2F8F9" to="#C7F1F4" fg={colors.brandDark} /> },
    { prefix: 'dinfo', key: 'payout', illustration: <Hero name="credit-card" from="#FFF4E0" to="#FDE7BE" fg={colors.warn} /> },
  ];

  const slides = set === 'driver' ? driverSlides : customerSlides;
  const [idx, setIdx] = useState(Math.min(slides.length - 1, Math.max(0, start)));
  const fade = useRef(new Animated.Value(1)).current;

  const go = (dir: 1 | -1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0) return;
    if (nextIdx > slides.length - 1) { navigation.goBack(); return; }
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    setIdx(nextIdx);
  };

  // авто-переход как в сториз
  useEffect(() => {
    const timer = setTimeout(() => go(1), 5000);
    return () => clearTimeout(timer);
  }, [idx]);

  const s = slides[idx];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* сегменты прогресса */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.l, paddingTop: 56, gap: 6 }}>
        {slides.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= idx ? colors.ink : colors.line }} />
        ))}
      </View>

      {/* закрыть */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', top: 72, right: 20, zIndex: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="x" size={26} color={colors.ink} />
      </TouchableOpacity>

      {/* зоны тапа: слева назад, справа вперёд */}
      <TouchableOpacity activeOpacity={1} onPress={() => go(-1)} style={{ position: 'absolute', left: 0, top: 100, bottom: 120, width: width * 0.33, zIndex: 10 }} />
      <TouchableOpacity activeOpacity={1} onPress={() => go(1)} style={{ position: 'absolute', right: 0, top: 100, bottom: 120, width: width * 0.67, zIndex: 10 }} />

      <Animated.View style={{ flex: 1, opacity: fade, paddingHorizontal: spacing.l, paddingTop: 40 }}>
        <Text style={{ fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: -1, lineHeight: 40 }}>{t(`${s.prefix}.${s.key}.title`)}</Text>
        <Text style={{ fontSize: 18, color: colors.sub, marginTop: spacing.m, lineHeight: 26 }}>{t(`${s.prefix}.${s.key}.body`)}</Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{s.illustration}</View>
      </Animated.View>

      <View style={{ padding: spacing.l, paddingBottom: 34 }}>
        <Button title={idx < slides.length - 1 ? t('info.next') : t(set === 'driver' ? 'dinfo.cta' : 'info.cta')}
          onPress={() => (idx < slides.length - 1 ? go(1) : navigation.goBack())} />
      </View>
    </View>
  );
};
