import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';
import { useT } from '@/i18n';

/**
 * Стилизованная mock-карта Вроцлава (кварталы, Одра, улицы).
 * В production заменяется на react-native-maps / Mapbox —
 * интерфейс компонента сохраняем: markers + route.
 */
export const MockMap: React.FC<{
  height?: number; style?: ViewStyle;
  showRoute?: boolean; driverProgress?: number; // 0..1 позиция водителя на маршруте
  searching?: boolean;
  children?: React.ReactNode;
}> = ({ height = 280, style, showRoute, driverProgress, searching, children }) => {
  const t = useT();
  const routePoints = [
    { x: 0.12, y: 0.82 }, { x: 0.3, y: 0.82 }, { x: 0.3, y: 0.55 },
    { x: 0.62, y: 0.55 }, { x: 0.62, y: 0.25 }, { x: 0.82, y: 0.25 },
  ];
  const pos = driverProgress != null
    ? routePoints[Math.min(Math.floor(driverProgress * (routePoints.length - 1)), routePoints.length - 1)]
    : null;

  return (
    <View style={[{ height, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#F1EFEA' }, style]}>
      {/* кварталы */}
      {[{ l: '4%', t: '5%', w: '26%', h: '24%' }, { l: '36%', t: '5%', w: '28%', h: '18%' }, { l: '70%', t: '5%', w: '26%', h: '28%' },
        { l: '4%', t: '38%', w: '20%', h: '30%' }, { l: '36%', t: '32%', w: '20%', h: '18%' },
        { l: '4%', t: '74%', w: '30%', h: '22%' }, { l: '42%', t: '68%', w: '24%', h: '26%' }, { l: '74%', t: '62%', w: '22%', h: '30%' },
      ].map((b, i) => (
        <View key={i} style={{ position: 'absolute', left: b.l as any, top: b.t as any, width: b.w as any, height: b.h as any, backgroundColor: '#E7E3DA', borderRadius: 10 }} />
      ))}
      {/* парк и река */}
      <View style={{ position: 'absolute', left: '38%', top: '54%', width: '24%', height: '10%', backgroundColor: '#CDE8C9', borderRadius: 10 }} />
      <View style={{ position: 'absolute', left: -20, top: '44%', width: '120%', height: 14, backgroundColor: '#BADAF2', borderRadius: 7, transform: [{ rotate: '-4deg' }] }} />
      {/* улицы */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: '30%', height: 8, backgroundColor: '#FFF' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '70%', height: 8, backgroundColor: '#FFF' }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '30%', width: 7, backgroundColor: '#FFF' }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '62%', width: 7, backgroundColor: '#FFF' }} />

      {showRoute && (
        <>
          {/* линия маршрута — сегменты */}
          {routePoints.slice(0, -1).map((p, i) => {
            const n = routePoints[i + 1];
            const horiz = p.y === n.y;
            return (
              <View key={i} style={{
                position: 'absolute',
                left: `${Math.min(p.x, n.x) * 100}%`, top: `${Math.min(p.y, n.y) * 100}%`,
                width: horiz ? `${Math.abs(n.x - p.x) * 100}%` : 5,
                height: horiz ? 5 : `${Math.abs(n.y - p.y) * 100}%`,
                backgroundColor: colors.brand, borderRadius: 3, opacity: 0.85,
              }} />
            );
          })}
          {/* точки A/B */}
          <Pin x={routePoints[0].x} y={routePoints[0].y} emoji="📍" />
          <Pin x={routePoints[routePoints.length - 1].x} y={routePoints[routePoints.length - 1].y} emoji="🏁" />
          {pos && <Pin x={pos.x} y={pos.y} emoji="🚚" big />}
        </>
      )}
      {searching && (
        <View style={{ position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: colors.brand, opacity: 0.5 }} />
        </View>
      )}
      {children}
      <Text style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: colors.faint }}>
        {t('map.demo')}
      </Text>
    </View>
  );
};

const Pin: React.FC<{ x: number; y: number; emoji: string; big?: boolean }> = ({ x, y, emoji, big }) => (
  <View style={{
    position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
    marginLeft: big ? -18 : -12, marginTop: big ? -18 : -12,
    width: big ? 36 : 24, height: big ? 36 : 24, borderRadius: 18,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.brand,
  }}>
    <Text style={{ fontSize: big ? 16 : 11 }}>{emoji}</Text>
  </View>
);
