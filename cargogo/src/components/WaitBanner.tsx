import React from 'react';
import { View, Text } from 'react-native';
import { useOrderStore } from '@/store/orders';
import { useAuthStore } from '@/store/auth';
import { useT } from '@/i18n';
import { Breathe } from '@/components/Anim';
import { usePricingStore } from '@/features/pricing/pricingService';
import { mulGr } from '@/features/pricing/pricingHelpers';
import { colors, radius, spacing } from '@/theme';

/**
 * §36/§2 — баннер ожидания на статусе driver_arrived.
 * Тарифы из конфига прайсинга. Клиент видит доплату к своей цене,
 * водитель — свою компенсацию (нетто); чужие суммы не показываются.
 */
export const WaitBanner: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role) ?? 'customer';
  const order = useOrderStore((s) => s.orders.find((o) => o.id === s.activeOrderId));
  const waitMins = useOrderStore((s) => s.waitMins);
  const additions = usePricingStore((s) => s.config.additions);

  if (order?.status !== 'driver_arrived') return null;
  const paidMin = Math.max(0, waitMins - additions.freeWaitingMin);
  const paid = paidMin > 0;

  let feeGr = mulGr(additions.waitingPerMinGr, paidMin);
  if (role === 'driver' && order.pricing) {
    // компенсация водителя — нетто по марже из снапшота
    feeGr = feeGr - mulGr(feeGr, order.pricing.marginPct);
  }
  const feeTxt = role === 'driver' ? (feeGr / 100).toFixed(2) : String(Math.round(feeGr / 100));

  const text = paid
    ? t('wait.paid', [paidMin, feeTxt])
    : t('wait.free', [additions.freeWaitingMin - waitMins]);

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
