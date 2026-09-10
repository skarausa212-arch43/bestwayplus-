import {
  AdminPricingView, CustomerPriceView, DriverPayoutView, PricingBreakdown,
} from './pricingTypes';
import { mulGr } from './pricingHelpers';

/**
 * Ролевые сериализаторы (§5, §8, §9, §15–16).
 * Разделение доступа НЕ визуальное: каждая роль получает отдельный объект,
 * в котором чужих финансовых полей просто НЕТ.
 * В мок-API это и есть «ответ сервера» для соответствующей роли.
 */

/** Клиент: понятная разбивка без формул, коэффициентов, маржи и выплаты водителя */
export function getCustomerPricingView(b: PricingBreakdown): CustomerPriceView {
  const transportGr =
    b.customerTotalRoundedGr
    - b.lines.externalGr
    - b.approvedAdditionsGr
    - b.lines.loadersGr
    - b.lines.stopsGr
    - b.lines.floorsGr
    - b.lines.waitingGr;

  const lines: CustomerPriceView['lines'] = [
    { labelKey: 'sum.transport', amountGr: transportGr },
  ];
  if (b.lines.loadersGr > 0) lines.push({ labelKey: 'sum.loader', amountGr: b.lines.loadersGr });
  if (b.lines.stopsGr > 0) lines.push({ labelKey: 'sum.stops', amountGr: b.lines.stopsGr });
  if (b.lines.floorsGr > 0) lines.push({ labelKey: 'sum.floors', amountGr: b.lines.floorsGr });
  if (b.lines.waitingGr > 0) lines.push({ labelKey: 'details.waiting', amountGr: b.lines.waitingGr });
  if (b.approvedAdditionsGr > 0) lines.push({ labelKey: 'sum.additions', amountGr: b.approvedAdditionsGr });
  if (b.lines.externalGr > 0) lines.push({ labelKey: 'sum.external', amountGr: b.lines.externalGr });

  return {
    lines,
    totalGr: b.customerTotalRoundedGr,
    demandNotice: b.applied.demandCoef > 1, // нейтральное сообщение, БЕЗ множителя
  };
}

/** Водитель: только его выплата и её составляющие (нетто), чаевые — полностью */
export function getDriverPricingView(b: PricingBreakdown): DriverPayoutView {
  const net = (gr: number) => gr - mulGr(gr, b.marginPct);
  const waitingGr = net(b.lines.waitingGr);
  const additionsGr = net(b.approvedAdditionsGr);
  const totalGr = b.driverPayoutGr;
  const basePayoutGr = totalGr - b.tipsGr - waitingGr - additionsGr;
  return { basePayoutGr, additionsGr, waitingGr, tipsGr: b.tipsGr, totalGr };
}

/** Админ / внутренние отчёты: полный расчёт, маржа, коэффициент спроса */
export function getAdminPricingView(b: PricingBreakdown): AdminPricingView {
  return {
    breakdown: b,
    customerTotalGr: b.customerTotalRoundedGr,
    driverPayoutGr: b.driverPayoutGr,
    platformRevenueGr: b.marginGr,
    demandCoef: b.applied.demandCoef,
  };
}
