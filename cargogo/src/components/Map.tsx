import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, ViewStyle, Platform } from 'react-native';
import MapView, { Marker, Polyline, Circle, LatLng } from 'react-native-maps';
import { Order } from '@/types';
import { DriverAvailabilityData } from '@/features/pricing/pricingTypes';
import { Pulse } from '@/components/Anim';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme';

/**
 * Настоящая карта (react-native-maps).
 * В Expo Go: Android — Google Maps, iOS — Apple Maps (Google-тайлы на iOS
 * доступны в production-сборке через PROVIDER_GOOGLE + API-ключ в app.json).
 * Интерфейс совместим с прежней MockMap: height/style/showRoute/driverProgress/searching.
 */

const WROCLAW = { latitude: 51.107, longitude: 17.038 };

// Точки маршрута заказа: погрузка → остановки → разгрузка
export const orderPoints = (order?: Order | null): LatLng[] => {
  if (!order) return [];
  return [
    { latitude: order.pickup.lat, longitude: order.pickup.lng },
    ...order.stops.map((s) => ({ latitude: s.lat, longitude: s.lng })),
    { latitude: order.destination.lat, longitude: order.destination.lng },
  ];
};

// Позиция водителя: линейная интерполяция вдоль маршрута по progress 0..1
const pointAt = (pts: LatLng[], progress: number): LatLng => {
  if (pts.length < 2) return pts[0] ?? WROCLAW;
  const segs = pts.length - 1;
  const p = Math.min(0.999, Math.max(0, progress)) * segs;
  const i = Math.floor(p);
  const f = p - i;
  return {
    latitude: pts[i].latitude + (pts[i + 1].latitude - pts[i].latitude) * f,
    longitude: pts[i].longitude + (pts[i + 1].longitude - pts[i].longitude) * f,
  };
};

// Иконка типа авто на карте (машинки онлайн)
const VEHICLE_ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  small_bus: 'truck', big_bus: 'truck', laweta: 'truck',
};

export const AppMap: React.FC<{
  height?: number; style?: ViewStyle;
  points?: LatLng[];
  showRoute?: boolean;
  driverProgress?: number; // 0..1 позиция водителя на маршруте
  searching?: boolean;
  /** Машинки онлайн — метки на карте (клиент видит доступный транспорт) */
  onlineDrivers?: DriverAvailabilityData[];
  /** Круг радиуса приёма заказов вокруг center (экран водителя) */
  radiusKm?: number;
  center?: LatLng;
  children?: React.ReactNode;
}> = ({ height = 280, style, points = [], showRoute, driverProgress, searching, onlineDrivers, radiusKm, center, children }) => {
  const ref = useRef<MapView>(null);
  const hasRoute = showRoute && points.length >= 2;
  const driverPos = useMemo(
    () => (hasRoute && driverProgress != null ? pointAt(points, driverProgress) : null),
    [hasRoute, driverProgress, points],
  );

  const mapCenter = center ?? WROCLAW;

  // Камера охватывает весь маршрут; водитель — плавным перелётом
  useEffect(() => {
    if (hasRoute && ref.current) {
      ref.current.fitToCoordinates(points, {
        edgePadding: { top: 70, bottom: 70, left: 60, right: 60 }, animated: true,
      });
    }
  }, [hasRoute, JSON.stringify(points)]);

  // Радиус приёма заказов: подгоняем зум под круг (≈111 км на градус широты)
  useEffect(() => {
    if (!hasRoute && radiusKm && center && ref.current) {
      const delta = Math.max(0.03, (radiusKm / 111) * 2.4);
      ref.current.animateToRegion({ latitude: center.latitude, longitude: center.longitude, latitudeDelta: delta, longitudeDelta: delta }, 400);
    }
  }, [radiusKm, hasRoute, center?.latitude, center?.longitude]);

  return (
    <View style={[{ height, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.line }, style]}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={{ ...WROCLAW, latitudeDelta: 0.09, longitudeDelta: 0.09 }}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {hasRoute && (
          <>
            <Polyline coordinates={points} strokeWidth={4} strokeColor={colors.ink}
              lineDashPattern={Platform.OS === 'android' ? undefined : undefined} />
            <Marker coordinate={points[0]} anchor={{ x: 0.5, y: 0.5 }}>
              <MapPin icon="map-pin" />
            </Marker>
            {points.slice(1, -1).map((p, i) => (
              <Marker key={i} coordinate={p} anchor={{ x: 0.5, y: 0.5 }}>
                <MapPin icon="circle" small />
              </Marker>
            ))}
            <Marker coordinate={points[points.length - 1]} anchor={{ x: 0.5, y: 0.5 }}>
              <MapPin icon="flag" />
            </Marker>
            {driverPos && (
              <Marker coordinate={driverPos} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
                <MapPin icon="truck" big />
              </Marker>
            )}
          </>
        )}

        {/* Круг радиуса приёма заказов (экран водителя) */}
        {radiusKm != null && center && (
          <>
            <Circle center={center} radius={radiusKm * 1000}
              strokeColor={colors.brand} strokeWidth={2} fillColor="rgba(15,181,190,0.10)" />
            <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} zIndex={12}>
              <MapPin icon="navigation" big />
            </Marker>
          </>
        )}

        {/* Машинки онлайн — доступный транспорт вокруг клиента */}
        {onlineDrivers?.map((d) => (
          <Marker key={d.id} coordinate={{ latitude: d.lat, longitude: d.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <VehicleDot type={d.vehicleType} />
          </Marker>
        ))}
      </MapView>
      {searching && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Pulse size={110} />
        </View>
      )}
      {children}
    </View>
  );
};

// Метка машинки онлайн — маленький круг с иконкой авто
const VehicleDot: React.FC<{ type: string }> = ({ type }) => (
  <View style={{
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
    shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  }}>
    <Feather name={VEHICLE_ICON[type] ?? 'truck'} size={14} color="#FFF" />
  </View>
);

const MapPin: React.FC<{ icon: React.ComponentProps<typeof Feather>['name']; big?: boolean; small?: boolean }> = ({ icon, big, small }) => {
  const size = big ? 40 : small ? 20 : 30;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: big ? colors.brand : colors.ink,
      shadowColor: '#0F172A', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
    }}>
      <Feather name={icon} size={big ? 20 : small ? 9 : 14} color={big ? colors.brandDark : colors.ink} />
    </View>
  );
};
