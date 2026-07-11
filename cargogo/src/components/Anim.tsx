import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// Появление снизу с фейдом — обёртка для карточек и блоков
export const FadeSlideIn: React.FC<{ delay?: number; children: React.ReactNode; style?: ViewStyle }> = ({ delay = 0, children, style }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, useNativeDriver: true, speed: 14, bounciness: 6 }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY: y }] }, style]}>
      {children}
    </Animated.View>
  );
};

// Пульсирующие кольца («радар» поиска водителя, индикатор Online)
export const Pulse: React.FC<{ size?: number; color?: string; style?: ViewStyle }> = ({ size = 90, color = colors.brand, style }) => {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const loop = (v: Animated.Value, delay: number) =>
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
  useEffect(() => {
    const l1 = loop(a1, 0); const l2 = loop(a2, 800);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, []);
  const ring = (v: Animated.Value) => ({
    position: 'absolute' as const, width: size, height: size, borderRadius: size / 2,
    borderWidth: 3, borderColor: color,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
  });
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="none">
      <Animated.View style={ring(a1)} />
      <Animated.View style={ring(a2)} />
      <Animated.View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, backgroundColor: color, opacity: 0.9 }} />
    </Animated.View>
  );
};

// Плавно анимируемый прогресс-бар статусов заказа
export const ProgressBar: React.FC<{ progress: number; height?: number; style?: ViewStyle }> = ({ progress, height = 6, style }) => {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: Math.min(1, Math.max(0, progress)), duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress]);
  return (
    <Animated.View style={[{ height, backgroundColor: colors.line, borderRadius: height / 2, overflow: 'hidden' }, style]}>
      <Animated.View style={{
        height, borderRadius: height / 2, backgroundColor: colors.brand,
        width: w.interpolate({ inputRange: [0, 1], outputRange: ['3%', '100%'] }),
      }} />
    </Animated.View>
  );
};
