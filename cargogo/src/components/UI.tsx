import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, ViewStyle, TextStyle, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, shadows, typography } from '@/theme';

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.l, ...shadows.card }, style]}>
    {children}
  </View>
);

// Кнопка с пружинным нажатием; primary/danger — на градиенте
export const Button: React.FC<{
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; style?: ViewStyle;
}> = ({ title, onPress, disabled, loading, variant = 'primary', style }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 5 }).start();

  const gradient = !disabled && (variant === 'primary' ? gradients.brand : variant === 'danger' ? gradients.danger : null);
  const bg = disabled ? colors.line : variant === 'secondary' ? colors.brandSoft : 'transparent';
  const fg = disabled ? colors.faint
    : variant === 'primary' || variant === 'danger' ? '#FFF'
    : variant === 'secondary' ? colors.brandDark : colors.sub;

  const inner = loading
    ? <ActivityIndicator color={fg} />
    : <Text style={{ color: fg, fontWeight: '800', fontSize: 16 }}>{title}</Text>;
  const box: ViewStyle = { paddingVertical: 15, borderRadius: radius.l, alignItems: 'center' };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        disabled={disabled || loading} activeOpacity={0.9} onPress={onPress}
        onPressIn={() => springTo(0.96)} onPressOut={() => springTo(1)}>
        {gradient ? (
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>
            {inner}
          </LinearGradient>
        ) : (
          <View style={[box, { backgroundColor: bg }]}>{inner}</View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export const Input: React.FC<{
  value: string; onChangeText: (v: string) => void; placeholder?: string;
  secureTextEntry?: boolean; keyboardType?: any; error?: string; label?: string; style?: ViewStyle;
}> = ({ label, error, style, ...props }) => (
  <View style={[{ marginBottom: spacing.m }, style]}>
    {label ? <Text style={[typography.sub, { marginBottom: 4, fontWeight: '600' }]}>{label}</Text> : null}
    <TextInput
      placeholderTextColor={colors.faint}
      style={{
        backgroundColor: '#F6F8FB', borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: colors.ink,
        borderWidth: 1.5, borderColor: error ? colors.danger : 'transparent',
      }}
      {...props}
    />
    {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
  </View>
);

export const StatusPill: React.FC<{ label: string; tone?: 'brand' | 'warn' | 'danger' | 'info' }> = ({ label, tone = 'brand' }) => {
  const map = {
    brand: [colors.brandSoft, colors.brandDark], warn: [colors.warnSoft, colors.warn],
    danger: [colors.dangerSoft, colors.danger], info: [colors.infoSoft, colors.info],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </View>
  );
};

export const Row: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>
);

export const H1: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => (
  <Text style={[typography.h1, style]}>{children}</Text>
);
export const H2: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => (
  <Text style={[typography.h2, style]}>{children}</Text>
);
export const Sub: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => (
  <Text style={[typography.sub, style]}>{children}</Text>
);

export const Stepper: React.FC<{ step: number; total: number }> = ({ step, total }) => (
  <View style={{ marginBottom: spacing.l }}>
    <Text style={[typography.sub, { fontWeight: '700', marginBottom: 6 }]}>Krok {step} z {total}</Text>
    <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
      <View style={{ height: 6, width: `${(step / total) * 100}%`, backgroundColor: colors.brand, borderRadius: 3 }} />
    </View>
  </View>
);
