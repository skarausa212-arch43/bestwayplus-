import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, gradients, radius, spacing } from '@/theme';

/**
 * Компоненты дизайн-системы v5: матовое стекло над картой, ценовой «герой»,
 * таймлайн маршрута, чипы и круглые кнопки-иконки. Стекло — expo-blur
 * (на Android включён экспериментальный метод, чтобы не было чёрного блока).
 */

const Handle = () => (
  <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#C7CFDA', alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
);

// Нижний матовый лист (search-панель, карточка водителя, статусы над картой)
export const GlassSheet: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle>; handle?: boolean }> = ({ children, style, handle = true }) => (
  <BlurView
    intensity={28} tint="light" experimentalBlurMethod="dimezisBlurView"
    style={[{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      borderTopLeftRadius: 34, borderTopRightRadius: 34, overflow: 'hidden',
      shadowColor: '#0B1220', shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: -12 }, elevation: 16,
    }, style]}
  >
    <View style={{ backgroundColor: 'rgba(255,255,255,0.72)', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 22, paddingBottom: 24 }}>
      {handle && <Handle />}
      {children}
    </View>
  </BlurView>
);

// Плавающая матовая «таблетка» (счётчики/бейджи поверх карты)
export const GlassBadge: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <BlurView intensity={30} tint="light" experimentalBlurMethod="dimezisBlurView"
    style={[{ borderRadius: 16, overflow: 'hidden', shadowColor: '#0B1220', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }, style]}>
    <View style={{ backgroundColor: 'rgba(255,255,255,0.82)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 }}>
      {children}
    </View>
  </BlurView>
);

// Круглая/квадратная кнопка-иконка
export const IconBtn: React.FC<{ icon: React.ComponentProps<typeof Feather>['name']; onPress?: () => void; bg?: string; fg?: string; size?: number; style?: StyleProp<ViewStyle> }> =
({ icon, onPress, bg = colors.card, fg = colors.ink, size = 48, style }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85}
    style={[{ width: size, height: size, borderRadius: 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
    <Feather name={icon} size={Math.round(size * 0.42)} color={fg} />
  </TouchableOpacity>
);

// Ценовой «герой» — тёмно-синий блок с тиффани-подсветкой и tabular-цифрой
export const PriceHero: React.FC<{
  label: string; amount: string; unit?: string; badge?: string;
  lines?: { label: string; value: string }[]; style?: StyleProp<ViewStyle>;
}> = ({ label, amount, unit = 'zł', badge, lines, style }) => (
  <LinearGradient colors={gradients.ink} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={[{ borderRadius: 28, padding: 24, overflow: 'hidden' }, style]}>
    <View style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(15,181,190,0.28)' }} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ color: '#9FB3C9', fontWeight: '700', fontSize: 15 }}>{label}</Text>
      {badge ? <View style={{ backgroundColor: 'rgba(15,181,190,0.22)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Text style={{ color: '#5FE6EE', fontWeight: '800', fontSize: 13 }}>{badge}</Text>
      </View> : null}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ color: '#FFF', fontSize: 46, fontWeight: '900', letterSpacing: -1.5 }}>{amount}</Text>
      <Text style={{ color: '#9FB3C9', fontSize: 22, fontWeight: '800', marginLeft: 8 }}>{unit}</Text>
    </View>
    {lines && lines.length > 0 && (
      <View style={{ marginTop: 16, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingTop: 14 }}>
        {lines.map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: '#C6D4E4', fontSize: 15 }}>{l.label}</Text>
            <Text style={{ color: '#C6D4E4', fontSize: 15, fontWeight: '700' }}>{l.value}</Text>
          </View>
        ))}
      </View>
    )}
  </LinearGradient>
);

// Таймлайн маршрута с чекпоинтами
export const Timeline: React.FC<{ points: { title: string; sub?: string; done?: boolean }[] }> = ({ points }) => (
  <View style={{ paddingLeft: 30 }}>
    <View style={{ position: 'absolute', left: 11, top: 8, bottom: 14, width: 3, backgroundColor: colors.line, borderRadius: 2 }} />
    {points.map((p, i) => (
      <View key={i} style={{ marginBottom: i === points.length - 1 ? 0 : 20 }}>
        <View style={{ position: 'absolute', left: -30, top: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card, borderWidth: 3, borderColor: p.done ? colors.brand : colors.line, alignItems: 'center', justifyContent: 'center' }}>
          {p.done && <Feather name="check" size={12} color={colors.brand} />}
        </View>
        <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 16 }}>{p.title}</Text>
        {p.sub ? <Text style={{ color: colors.sub, fontSize: 14, marginTop: 1 }}>{p.sub}</Text> : null}
      </View>
    ))}
  </View>
);

// Чип-таблетка (иконка + текст)
export const Chip: React.FC<{ label: string; icon?: React.ComponentProps<typeof Feather>['name']; active?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle> }> =
({ label, icon, active, onPress, style }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85}
    style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: active ? colors.ink : colors.card, borderWidth: 1, borderColor: active ? colors.ink : colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }, style]}>
    {icon && <Feather name={icon} size={16} color={active ? '#FFF' : '#33465C'} style={{ marginRight: 7 }} />}
    <Text style={{ color: active ? '#FFF' : '#33465C', fontWeight: '700', fontSize: 14 }}>{label}</Text>
  </TouchableOpacity>
);

// Мини-график (спарклайн из столбиков)
export const Spark: React.FC<{ data: number[]; color?: string; height?: number }> = ({ data, color = colors.brand, height = 52 }) => {
  const max = Math.max(...data, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
      {data.map((v, i) => (
        <View key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, backgroundColor: color, borderRadius: 3, opacity: 0.85 }} />
      ))}
    </View>
  );
};

// Большое tabular-число (цена/сумма)
export const Stat: React.FC<{ children: React.ReactNode; style?: StyleProp<TextStyle> }> = ({ children, style }) => (
  <Text style={[{ color: colors.ink, fontWeight: '900', fontSize: 40, letterSpacing: -1.5 }, style]}>{children}</Text>
);

export const glassRadius = radius;
export const glassSpacing = spacing;
