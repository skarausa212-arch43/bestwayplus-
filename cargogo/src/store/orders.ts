import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Order, OrderStatus, ChatMessage, ChatLang, CargoInfo, Address,
  VehicleType, PriceRequest, Role,
} from '@/types';
import { MOCK_PAST_ORDERS } from '@/mocks';
import { WAIT_TICK_MS } from '@/constants';
import { APP_CONFIG } from '@/config/app';
import { notify } from '@/services/notifications';
import { t, langOf } from '@/i18n';
import { translateMessage } from '@/services/translate';
import { buildInput, lockPrice, getPricingConfig } from '@/features/pricing/pricingService';
import { applyAdjustment, applyWaiting } from '@/features/pricing/pricingEngine';
import { makeId } from '@/features/pricing/pricingHelpers';
import { PriceChangeReason, PricingSnapshot } from '@/features/pricing/pricingTypes';

// Статусы, о которых клиент получает уведомление (раздел 47 ТЗ) — тела в ключах nc.*
const CUSTOMER_NOTIF_STATUSES: OrderStatus[] = [
  'accepted', 'driver_en_route', 'driver_arrived', 'loading', 'in_transit',
  'arrived_destination', 'unloading', 'awaiting_confirmation', 'completed', 'cancelled',
];

// Текст сообщения чата на языке зрителя (msgText из прототипа)
export function chatMsgText(m: ChatMessage, viewerLang: ChatLang): { text: string; translated?: boolean; pending?: boolean } {
  if (m.key) return { text: t(m.key, [], viewerLang) };
  if (m.lang === viewerLang) return { text: m.text ?? '' };
  const tr = m.tr?.[viewerLang];
  if (tr) return { text: tr, translated: true };
  return { text: m.text ?? '', pending: m.pending };
}

const toChatLang = (role: Role): ChatLang => {
  const l = langOf(role);
  return l === 'ru' || l === 'en' ? l : 'pl';
};

/** Обновить заказ новым снапшотом цены (§13): клиентский total и ревизия */
const withSnapshot = (o: Order, snap: PricingSnapshot, reason: string, comment?: string): Order => {
  const prev = o.pricing;
  return {
    ...o,
    pricing: snap,
    price: { ...o.price, waiting: snap.lines.waitingGr / 100, total: snap.customerTotalRoundedGr / 100 },
    pricingRevisions: [
      ...(o.pricingRevisions ?? []),
      {
        revisionId: makeId('rev'),
        at: new Date().toISOString(),
        reason: reason as any,
        comment,
        deltaCustomerGr: snap.customerTotalExactGr - (prev?.customerTotalExactGr ?? snap.customerTotalExactGr),
        deltaDriverGr: snap.driverPayoutGr - (prev?.driverPayoutGr ?? snap.driverPayoutGr),
        snapshot: snap,
      },
    ],
  };
};

interface OrderState {
  orders: Order[];
  activeOrderId: string | null;
  messages: ChatMessage[];
  waitMins: number;
  waitNotified: boolean;
  priceReq: PriceRequest | null;
  createOrder: (data: { pickup: Address; destination: Address; stops: Address[]; cargo: CargoInfo; vehicleType: VehicleType; distanceKm: number; urgent: boolean }) => Order;
  payOrder: (orderId: string) => void;
  assignDriver: (orderId: string, driverId: string, vehicleId: string) => void;
  setStatus: (orderId: string, status: OrderStatus) => void;
  completeWithCode: (orderId: string, code: string) => boolean;
  cancelOrder: (orderId: string, byRole: 'customer' | 'driver') => void;
  sendMessage: (orderId: string, senderId: string, senderRole: 'customer' | 'driver', text: string) => void;
  sendQuick: (orderId: string, senderId: string, senderRole: 'customer' | 'driver', idx: number) => void;
  sendPriceReq: (amountGr: number, reason: PriceChangeReason, comment?: string) => void;
  answerPriceReq: (accept: boolean) => void;
  startWait: (reset?: boolean) => void;
  stopWait: () => void;
  activeOrder: () => Order | undefined;
}

// Хэндл интервала живёт вне стора — его нельзя сериализовать
let waitInterval: ReturnType<typeof setInterval> | null = null;

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [...MOCK_PAST_ORDERS],
      activeOrderId: null,
      messages: [],
      waitMins: 0,
      waitNotified: false,
      priceReq: null,

      // §12: при создании заказа цена фиксируется снапшотом Pricing Engine
      createOrder: (data) => {
        const c = data.cargo;
        const floorsNoElevator =
          (c.hasElevatorFrom ? 0 : Math.max(0, c.floorFrom)) +
          (c.hasElevatorTo ? 0 : Math.max(0, c.floorTo));
        const snap = lockPrice(buildInput({
          vehicleType: data.vehicleType,
          distanceKm: data.distanceKm,
          extraStops: data.stops.length,
          loaders: c.loadersCount,
          floorsNoElevator,
          urgent: data.urgent,
        }));
        let order: Order = {
          id: `o-${Date.now()}`, customerId: 'u-cust-1',
          ...data,
          price: { transport: 0, distance: 0, loaders: 0, extraStops: 0, serviceFee: 0, urgentFee: 0, waiting: 0, total: snap.customerTotalRoundedGr / 100 },
          status: 'awaiting_payment', paymentStatus: 'pending',
          statusHistory: [{ status: 'awaiting_payment', at: new Date().toISOString() }],
          confirmationCode: APP_CONFIG.confirmationCodeMock,
          createdAt: new Date().toISOString(),
        };
        order = withSnapshot(order, snap, 'initial');
        set((s) => ({ orders: [order, ...s.orders], activeOrderId: order.id, priceReq: null }));
        return order;
      },

      payOrder: (orderId) => {
        get().setStatus(orderId, 'searching');
        set((s) => ({ orders: s.orders.map((o) => o.id === orderId ? { ...o, paymentStatus: 'blocked' } : o) }));
        const order = get().orders.find((o) => o.id === orderId);
        notify('customer', 'n.payBlocked', 'n.payBlockedB', [order?.price.total ?? 0], { orderId });
        setTimeout(() => {
          const o = get().orders.find((x) => x.id === orderId);
          if (o?.status === 'searching') {
            notify('driver', 'n.newOrder', 'n.newOrderB', [o.pickup.full, o.destination.full], { orderId });
          }
        }, 1500);
      },

      assignDriver: (orderId, driverId, vehicleId) => {
        set((s) => ({ orders: s.orders.map((o) => o.id === orderId ? { ...o, driverId, vehicleId } : o) }));
        get().setStatus(orderId, 'accepted');
      },

      setStatus: (orderId, status) => {
        const prev = get().orders.find((o) => o.id === orderId)?.status;
        if (prev === 'driver_arrived' && status !== 'driver_arrived') get().stopWait();
        set((s) => ({
          orders: s.orders.map((o) => o.id === orderId
            ? { ...o, status, statusHistory: [...o.statusHistory, { status, at: new Date().toISOString() }] }
            : o),
        }));
        if (status === 'driver_arrived') get().startWait();
        if (CUSTOMER_NOTIF_STATUSES.includes(status)) {
          notify('customer', `status.${status}`, `nc.${status}`, [], { orderId });
        }
        if (status !== 'searching' && status !== 'awaiting_payment') {
          const m: ChatMessage = {
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            orderId, senderId: 'system', type: 'system', key: `status.${status}`,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({ messages: [...s.messages, m] }));
        }
      },

      completeWithCode: (orderId, code) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order || code !== order.confirmationCode) return false;
        get().setStatus(orderId, 'completed');
        set((s) => ({
          orders: s.orders.map((o) => o.id === orderId ? { ...o, paymentStatus: 'captured' } : o),
          activeOrderId: null,
          priceReq: null,
        }));
        const done = get().orders.find((o) => o.id === orderId)!;
        const totalPln = done.price.total;
        // Водителю — только его выплата; клиенту — только его сумма (§5–6)
        const payoutPln = done.pricing ? done.pricing.driverPayoutGr / 100 : Math.round(totalPln * 0.9);
        notify('driver', 'n.jobDone', 'n.jobDoneB', [payoutPln.toFixed(2)], { orderId });
        notify('customer', 'n.payDone', 'n.payDoneB', [totalPln], { orderId });
        return true;
      },

      cancelOrder: (orderId, byRole) => {
        get().setStatus(orderId, 'cancelled');
        get().stopWait();
        set({ activeOrderId: null, priceReq: null, waitMins: 0, waitNotified: false });
        notify(byRole === 'customer' ? 'driver' : 'customer', 'n.cancelled',
          byRole === 'customer' ? 'n.cancByCust' : 'n.cancByDrv', [], { orderId });
      },

      sendMessage: (orderId, senderId, senderRole, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const lang = toChatLang(senderRole);
        const m: ChatMessage = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          orderId, senderId, type: 'text', text: trimmed, lang,
          tr: { [lang]: trimmed }, pending: true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, m] }));
        notify(senderRole === 'customer' ? 'driver' : 'customer', 'n.msg', undefined, [], { rawBody: trimmed, orderId });
        translateMessage(trimmed).then((tr) => {
          set((s) => ({
            messages: s.messages.map((x) => x.id === m.id
              ? { ...x, tr: tr ? { ...x.tr, ...tr, [lang]: trimmed } : x.tr, pending: false }
              : x),
          }));
        });
      },

      sendQuick: (orderId, senderId, senderRole, idx) => {
        const m: ChatMessage = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          orderId, senderId, type: 'text', key: `q.${idx}`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, m] }));
        notify(senderRole === 'customer' ? 'driver' : 'customer', 'n.msg', `q.${idx}`, [], { orderId });
      },

      // §13/§37: водитель запрашивает доплату (типовая причина + сумма + комментарий)
      sendPriceReq: (amountGr, reason, comment) => {
        const orderId = get().activeOrderId;
        if (!orderId || !amountGr || amountGr <= 0) return;
        set({ priceReq: { orderId, amountGr, reason, comment, status: 'pending' } });
        const pln = Math.round(amountGr / 100);
        notify('driver', 'n.prSent', 'n.prSentB', [pln], { orderId });
        notify('customer', 'n.pr', 'n.prB', [pln, t(`prr.${reason}`, [], langOf('customer'))], { orderId });
      },

      // Клиент одобряет → новая ревизия цены по марже ИЗ СНАПШОТА (§12–13)
      answerPriceReq: (accept) => {
        const pr = get().priceReq;
        if (!pr) return;
        const order = get().orders.find((o) => o.id === pr.orderId);
        if (accept && order?.pricing) {
          const snap = applyAdjustment(order.pricing, pr.amountGr, getPricingConfig().rounding.customerRoundToGr);
          set((s) => ({
            orders: s.orders.map((o) => o.id === pr.orderId ? withSnapshot(o, snap, pr.reason, pr.comment) : o),
            priceReq: null,
          }));
          const newTotal = snap.customerTotalRoundedGr / 100;
          notify('driver', 'n.prAcc', 'n.prAccB', [(snap.driverPayoutGr / 100).toFixed(2)], { orderId: pr.orderId });
          notify('customer', 'n.prAcc', 'n.prAccB', [newTotal], { orderId: pr.orderId });
        } else {
          const total = order?.price.total ?? 0;
          set({ priceReq: null });
          notify('driver', 'n.prDec', 'n.prDecB', [total], { orderId: pr.orderId });
        }
      },

      // §2: ожидание — бесплатные минуты и ставка из КОНФИГА прайсинга
      startWait: (reset = true) => {
        if (waitInterval) clearInterval(waitInterval);
        if (reset) set({ waitMins: 0, waitNotified: false });
        waitInterval = setInterval(() => {
          const s = get();
          const cfg = getPricingConfig().additions;
          const mins = s.waitMins + 1;
          let notified = s.waitNotified;
          if (mins > cfg.freeWaitingMin && !notified) {
            notified = true;
            const rate = (cfg.waitingPerMinGr / 100).toFixed(2);
            notify('customer', 'n.waitPaid', 'n.waitPaidB', [rate], { orderId: s.activeOrderId ?? undefined });
            notify('driver', 'n.waitPaid', 'n.waitPaidB', [rate], { orderId: s.activeOrderId ?? undefined });
          }
          set({ waitMins: mins, waitNotified: notified });
        }, WAIT_TICK_MS);
      },

      // Фиксация платного ожидания в снапшот по СНАПШОТНОЙ марже
      stopWait: () => {
        if (waitInterval) { clearInterval(waitInterval); waitInterval = null; }
        const { waitMins, activeOrderId } = get();
        const cfg = getPricingConfig();
        const paidMin = Math.max(0, waitMins - cfg.additions.freeWaitingMin);
        const order = get().orders.find((o) => o.id === activeOrderId);
        if (paidMin > 0 && order?.pricing) {
          const snap = applyWaiting(order.pricing, paidMin, cfg.additions.waitingPerMinGr, cfg.rounding.customerRoundToGr);
          set((s) => ({
            orders: s.orders.map((o) => o.id === activeOrderId ? withSnapshot(o, snap, 'waiting') : o),
          }));
        }
        set({ waitMins: 0, waitNotified: false });
      },

      activeOrder: () => get().orders.find((o) => o.id === get().activeOrderId),
    }),
    {
      name: 'cargogo-orders',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        orders: s.orders, activeOrderId: s.activeOrderId, messages: s.messages,
        waitMins: s.waitMins, waitNotified: s.waitNotified, priceReq: s.priceReq,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<OrderState>) }),
      onRehydrateStorage: () => (state) => {
        if (state && state.activeOrder()?.status === 'driver_arrived') state.startWait(false);
      },
    },
  ),
);
