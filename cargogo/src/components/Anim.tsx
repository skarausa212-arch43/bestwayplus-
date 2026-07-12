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

// Появление с «выстреливающим» масштабом (галочка успеха, бейджи)
export const PopIn: React.FC<{ delay?: number; children: React.ReactNode; style?: ViewStyle }> = ({ delay = 0, children, style }) => {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: 1, delay, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, []);
  return <Animated.View style={[{ transform: [{ scale: s }] }, style]}>{children}</Animated.View>;
};

// Покачивание (колокольчик с непрочитанными)
export const Shake: React.FC<{ active?: boolean; children: React.ReactNode }> = ({ active = true, children }) => {
  const r = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { r.setValue(0); return; }
    const seq = Animated.loop(Animated.sequence([
      Animated.delay(2200),
      ...[1, -1, 0.7, -0.7, 0.4, 0].map((v) =>
        Animated.timing(r, { toValue: v, duration: 70, useNativeDriver: true })),
    ]));
    seq.start();
    return () => seq.stop();
  }, [active]);
  return (
    <Animated.View style={{ transform: [{ rotate: r.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] }) }] }}>
      {children}
    </Animated.View>
  );
};

// Плавный «набегающий» счётчик суммы (цены в мастере и заказе)
export const AnimatedNumber: React.FC<{ value: number; suffix?: string; textStyle?: any; duration?: number }> = ({ value, suffix = ' zł', textStyle, duration = 500 }) => {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = React.useState(value);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(anim, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [value]);
  return <Animated.Text style={textStyle}>{display}{suffix}</Animated.Text>;
};

// Конфетти при завершении заказа 🎉
export const Confetti: React.FC<{ count?: number }> = ({ count = 26 }) => {
  const pieces = useRef(Array.from({ length: count }).map((_, i) => ({
    x: Math.random() * 360,
    delay: Math.random() * 600,
    rot: Math.random() > 0.5 ? 1 : -1,
    color: ['#00C98D', '#F5A623', '#3E7BFA', '#E5484D', '#FFC531'][i % 5],
    size: 6 + Math.random() * 6,
    v: new Animated.Value(0),
  }))).current;
  useEffect(() => {
    pieces.forEach((p) => {
      Animated.timing(p.v, { toValue: 1, duration: 2400 + Math.random() * 1200, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    });
  }, []);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}>
      {pieces.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', top: -20, left: p.x,
          width: p.size, height: p.size * 1.6, borderRadius: 2, backgroundColor: p.color,
          opacity: p.v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, 860] }) },
            { translateX: p.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.rot * 30, p.rot * -20] }) },
            { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot * 540}deg`] }) },
          ],
        }} />
      ))}
    </Animated.View>
  );
};

// Мягкое «дыхание» (баннер платного ожидания, точка Online)
export const Breathe: React.FC<{ children: React.ReactNode; active?: boolean; style?: ViewStyle }> = ({ children, active = true, style }) => {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { s.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(s, { toValue: 1.03, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(s, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return <Animated.View style={[{ transform: [{ scale: s }] }, style]}>{children}</Animated.View>;
};
