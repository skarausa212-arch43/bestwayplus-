import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity } from 'react-native';
import { useNotificationStore } from '@/store/notifications';
import { renderNotifTitle, renderNotifBody } from '@/services/notifications';
import { colors, radius, shadows } from '@/theme';

// In-app баннер уведомления поверх любого экрана (текст — на языке роли-получателя)
export const ToastHost: React.FC = () => {
  const toast = useNotificationStore((s) => s.toast);
  const dismiss = useNotificationStore((s) => s.dismissToast);
  const y = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.spring(y, { toValue: toast ? 0 : -120, useNativeDriver: true, bounciness: 6 }).start();
  }, [toast]);

  if (!toast) return null;
  return (
    <Animated.View style={{
      position: 'absolute', top: 54, left: 16, right: 16, zIndex: 999,
      transform: [{ translateY: y }],
    }}>
      <TouchableOpacity activeOpacity={0.9} onPress={dismiss} style={{
        backgroundColor: colors.ink, borderRadius: radius.l, padding: 14, ...shadows.card,
      }}>
        <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>🔔 {renderNotifTitle(toast)}</Text>
        <Text style={{ color: '#C9CFD9', fontSize: 13, marginTop: 2 }} numberOfLines={2}>{renderNotifBody(toast)}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
