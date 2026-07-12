import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Image, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/UI';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

const { width } = Dimensions.get('window');

// Познавательные слайды (сториз-стиль, как в референсе Яндекс Go «Грузовой»)
type Slide = { key: string; illustration: React.ReactNode; tint: string };

const vanSmall = require('../../../assets/vehicles/van-small.png');

const bigIcon = (name: React.ComponentProps<typeof Feather>['name'], tint: string) => (
  <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
    <Feather name={name} size={72} color={colors.brandDark} />
  </View>
);

export const InfoSlidesScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const t = useT();
  const start: number = route?.params?.start ?? 0;
  const [idx, setIdx] = useState(Math.min(3, Math.max(0, start)));
  const fade = useRef(new Animated.Value(1)).current;

  const slides: Slide[] = [
    { key: 'delivery', tint: colors.brandSoft, illustration: bigIcon('truck', colors.brandSoft) },
    { key: 'body', tint: colors.surface, illustration: (
      <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.l, alignItems: 'center', width: width * 0.7 }}>
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
    { key: 'loaders', tint: colors.brandSoft, illustration: bigIcon('users', colors.brandSoft) },
    { key: 'waiting', tint: colors.warnSoft, illustration: (
      <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="clock" size={72} color={colors.warn} />
      </View>
    ) },
  ];

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
        <Text style={{ fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: -1, lineHeight: 40 }}>{t(`info.${s.key}.title`)}</Text>
        <Text style={{ fontSize: 18, color: colors.sub, marginTop: spacing.m, lineHeight: 26 }}>{t(`info.${s.key}.body`)}</Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{s.illustration}</View>
      </Animated.View>

      <View style={{ padding: spacing.l, paddingBottom: 34 }}>
        <Button title={idx < slides.length - 1 ? t('info.next') : t('info.cta')}
          onPress={() => (idx < slides.length - 1 ? go(1) : navigation.goBack())} />
      </View>
    </View>
  );
};
