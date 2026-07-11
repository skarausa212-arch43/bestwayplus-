import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Order, OrderStatus, ChatMessage, ChatLang, CargoInfo, Address,
  VehicleType, PriceBreakdown, PriceRequest, Role,
} from '@/types';
import { MOCK_PAST_ORDERS } from '@/mocks';
import { TARIFF, VEHICLE_TYPES, WAIT_TICK_MS } from '@/constants';
import { APP_CONFIG } from '@/config/app';
import { notify } from '@/services/notifications';
import { t, langOf } from '@/i18n';
import { translateMessage } from '@/services/translate';

// Статусы, о которых клиент получает уведомление (раздел 47 ТЗ) — тела в ключах nc.*
const CUSTOMER_NOTIF_STATUSES: OrderStatus[] = [
  'accepted', 'driver_en_route', 'driver_arrived', 'loading', 'in_transit',
  'arrived_destination', 'unloading', 'awaiting_confirmation', 'completed', 'cancelled',
];

export function calcPrice(vehicleType: VehicleType, distanceKm: number, cargo: Partial<CargoInfo>, stops: number, urgent: boolean): PriceBreakdown {
  const vt = VEHICLE_TYPES[vehicleType];
  const transport = vt.basePrice;
  const distance = Math.round(distanceKm * vt.pricePerKm);
  const loaders = (cargo.loadersCount ?? 0) * TARIFF.loaderPrice;
  const extraStops = stops * TARIFF.extraStopPrice;
  const urgentFee = urgent ? TARIFF.urgentFee : 0;
  const winch = vehicleType === 'laweta' && cargo.carRunning === false ? TARIFF.winchFee : 0;
  const subtotal = transport + distance + loaders + extraStops + urgentFee + winch;
  const serviceFee = Math.round(subtotal * TARIFF.serviceFeePct);
  return { transport: transport + winch, distance, loaders, extraStops, serviceFee, urgentFee, waiting: 0, total: subtotal + serviceFee };
}

// Текст сообщения чата на языке зрителя (msgText из прототипа):
// ключи словаря — мгновенно; свободный текст — оригинал или автоперевод с пометкой
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

interface OrderState {
  orders: Order[];
  activeOrderId: string | null;
  messages: ChatMessage[];
  // §36 — ожидание на статусе driver_arrived
  waitMins: number;
  waitFee: number;
  waitNotified: boolean;
  // §37 — запрос изменения цены
  priceReq: PriceRequest | null;
  createOrder: (data: { pickup: Address; destination: Address; stops: Address[]; cargo: CargoInfo; vehicleType: VehicleType; distanceKm: number; urgent: boolean }) => Order;
  payOrder: (orderId: string) => void;
  assignDriver: (orderId: string, driverId: string, vehicleId: string) => void;
  setStatus: (orderId: string, status: OrderStatus) => void;
  completeWithCode: (orderId: string, code: string) => boolean;
  cancelOrder: (orderId: string, byRole: 'customer' | 'driver') => void;
  sendMessage: (orderId: string, senderId: string, senderRole: 'customer' | 'driver', text: string) => void;
  sendQuick: (orderId: string, senderId: string, senderRole: 'customer' | 'driver', idx: number) => void;
  sendPriceReq: (amount: number, reason: string) => void;
  answerPriceReq: (accept: boolean) => void;
  startWait: (reset?: boolean) => void;
  stopWait: () => void;
  activeOrder: () => Order | undefined;
}

// Хэндл интервала живёт вне стора — его нельзя сериализовать в AsyncStorage
let waitInterval: ReturnType<typeof setInterval> | null = null;

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [...MOCK_PAST_ORDERS],
      activeOrderId: null,
      messages: [],
      waitMins: 0,
      waitFee: 0,
      waitNotified: false,
      priceReq: null,

      createOrder: (data) => {
        const order: Order = {
          id: `o-${Date.now()}`, customerId: 'u-cust-1',
          ...data,
          price: calcPrice(data.vehicleType, data.distanceKm, data.cargo, data.stops.length, data.urgent),
          status: 'awaiting_payment', paymentStatus: 'pending',
          statusHistory: [{ status: 'awaiting_payment', at: new Date().toISOString() }],
          confirmationCode: APP_CONFIG.confirmationCodeMock,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ orders: [order, ...s.orders], activeOrderId: order.id, priceReq: null }));
        return order;
      },

      payOrder: (orderId) => {
        get().setStatus(orderId, 'searching');
        set((s) => ({ orders: s.orders.map((o) => o.id === orderId ? { ...o, paymentStatus: 'blocked' } : o) }));
        const order = get().orders.find((o) => o.id === orderId);
        notify('customer', 'n.payBlocked', 'n.payBlockedB', [order?.price.total ?? 0], { orderId });
        // Имитация: заказ прилетает водителю
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
        // §36: уходим со статуса «на месте» — фиксируем доплату за ожидание
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
          // Системное сообщение чата хранится ключом — каждый видит его на своём языке
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
        const total = get().orders.find((o) => o.id === orderId)?.price.total ?? order.price.total;
        const net = Math.round(total * (1 - TARIFF.commissionPct));
        notify('driver', 'n.jobDone', 'n.jobDoneB', [net], { orderId });
        notify('customer', 'n.payDone', 'n.payDoneB', [total], { orderId });
        return true;
      },

      cancelOrder: (orderId, byRole) => {
        get().setStatus(orderId, 'cancelled');
        get().stopWait();
        set({ activeOrderId: null, priceReq: null, waitMins: 0, waitFee: 0, waitNotified: false });
        notify(byRole === 'customer' ? 'driver' : 'customer', 'n.cancelled',
          byRole === 'customer' ? 'n.cancByCust' : 'n.cancByDrv', [], { orderId });
      },

      // Свободный текст: {text, lang, tr, pending} как в прототипе; перевод — серверным вызовом
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

      // Быстрая фраза: хранится ключом словаря — мгновенный «перевод» без сети
      sendQuick: (orderId, senderId, senderRole, idx) => {
        const m: ChatMessage = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          orderId, senderId, type: 'text', key: `q.${idx}`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, m] }));
        notify(senderRole === 'customer' ? 'driver' : 'customer', 'n.msg', `q.${idx}`, [], { orderId });
      },

      // §37: водитель предлагает новую цену (сумма + причина)
      sendPriceReq: (amount, reason) => {
        const orderId = get().activeOrderId;
        if (!orderId || !amount || amount <= 0) return;
        const r = reason.trim() || '—';
        set({ priceReq: { orderId, amount, reason: r, status: 'pending' } });
        notify('driver', 'n.prSent', 'n.prSentB', [amount], { orderId });
        notify('customer', 'n.pr', 'n.prB', [amount, r], { orderId });
      },

      // §37: клиент принимает/отклоняет
      answerPriceReq: (accept) => {
        const pr = get().priceReq;
        if (!pr) return;
        if (accept) {
          set((s) => ({
            orders: s.orders.map((o) => o.id === pr.orderId
              ? { ...o, price: { ...o.price, total: pr.amount } } : o),
            priceReq: null,
          }));
          notify('driver', 'n.prAcc', 'n.prAccB', [pr.amount], { orderId: pr.orderId });
          notify('customer', 'n.prAcc', 'n.prAccB', [pr.amount], { orderId: pr.orderId });
        } else {
          const total = get().orders.find((o) => o.id === pr.orderId)?.price.total ?? 0;
          set({ priceReq: null });
          notify('driver', 'n.prDec', 'n.prDecB', [total], { orderId: pr.orderId });
        }
      },

      // §36: 10 бесплатных минут, дальше 2 zł/мин (startWait из прототипа; тик = WAIT_TICK_MS)
      startWait: (reset = true) => {
        if (waitInterval) clearInterval(waitInterval);
        if (reset) set({ waitMins: 0, waitFee: 0, waitNotified: false });
        waitInterval = setInterval(() => {
          const s = get();
          const mins = s.waitMins + 1;
          let fee = s.waitFee;
          let notified = s.waitNotified;
          if (mins > APP_CONFIG.freeWaitingMinutes) {
            fee = (mins - APP_CONFIG.freeWaitingMinutes) * APP_CONFIG.waitingPricePerMin;
            if (!notified) {
              notified = true;
              notify('customer', 'n.waitPaid', 'n.waitPaidB', [APP_CONFIG.waitingPricePerMin], { orderId: s.activeOrderId ?? undefined });
              notify('driver', 'n.waitPaid', 'n.waitPaidB', [APP_CONFIG.waitingPricePerMin], { orderId: s.activeOrderId ?? undefined });
            }
          }
          set({ waitMins: mins, waitFee: fee, waitNotified: notified });
        }, WAIT_TICK_MS);
      },

      // §36: доплата за платное ожидание попадает в price.waiting и total
      stopWait: () => {
        if (waitInterval) { clearInterval(waitInterval); waitInterval = null; }
        const { waitFee, activeOrderId } = get();
        if (waitFee > 0 && activeOrderId) {
          set((s) => ({
            orders: s.orders.map((o) => o.id === activeOrderId
              ? { ...o, price: { ...o.price, waiting: o.price.waiting + waitFee, total: o.price.total + waitFee } }
              : o),
          }));
        }
        set({ waitMins: 0, waitFee: 0, waitNotified: false });
      },

      activeOrder: () => get().orders.find((o) => o.id === get().activeOrderId),
    }),
    {
      name: 'cargogo-orders',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        orders: s.orders, activeOrderId: s.activeOrderId, messages: s.messages,
        waitMins: s.waitMins, waitFee: s.waitFee, waitNotified: s.waitNotified,
        priceReq: s.priceReq,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<OrderState>) }),
      // После рестарта: если заказ уже «на месте» — таймер ожидания продолжает тикать
      onRehydrateStorage: () => (state) => {
        if (state && state.activeOrder()?.status === 'driver_arrived') state.startWait(false);
      },
    },
  ),
);
