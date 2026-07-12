import React from 'react';
import { View, Text } from 'react-native';
import { useOrderStore } from '@/store/orders';
import { useT } from '@/i18n';
import { Breathe } from '@/components/Anim';
import { APP_CONFIG } from '@/config/app';
import { colors, radius, spacing } from '@/theme';

/**
 * §36 — баннер ожидания на статусе driver_arrived (виден обеим ролям):
 * сначала обратный отсчёт 10 бесплатных минут, затем счётчик платного ожидания 2 zł/мин.
 */
export const WaitBanner: React.FC = () => {
  const t = useT();
  const order = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  const waitMins = useOrderStore((s) => s.waitMins);
  const waitFee = useOrderStore((s) => s.waitFee);

  if (order?.status !== 'driver_arrived') return null;
  const paid = waitMins > APP_CONFIG.freeWaitingMinutes;
  const text = paid
    ? t('wait.paid', [waitMins - APP_CONFIG.freeWaitingMinutes, waitFee])
    : t('wait.free', [APP_CONFIG.freeWaitingMinutes - waitMins]);

  return (
    <Breathe active={paid}>
    <View style={{
      backgroundColor: paid ? colors.warnSoft : colors.card,
      borderWidth: 2, borderColor: paid ? colors.warn : colors.line,
      borderRadius: radius.l, padding: spacing.m, marginBottom: spacing.m,
    }}>
      <Text style={{ fontWeight: '800', color: paid ? colors.warn : colors.ink }}>{text}</Text>
    </View>
    </Breathe>
  );
};
