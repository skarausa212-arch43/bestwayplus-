import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Review, OrderReport, ReportReason, Role } from '@/types';
import { notify } from '@/services/notifications';

/**
 * Оценки (двусторонние: клиент↔водитель) и жалобы «Проблема с заказом».
 * Рейтинг клиента агрегируется здесь; рейтинг водителя живёт в driver-сторе.
 */
interface CommunityState {
  reviews: Review[];
  reports: OrderReport[];
  // Агрегированный рейтинг текущего клиента (в production — с бэкенда)
  customerRating: number;
  customerRatingCount: number;
  rateDriver: (orderId: string, driverId: string, rating: number, comment?: string, tip?: number, tags?: string[]) => void;
  rateCustomer: (orderId: string, customerId: string, rating: number, comment?: string, tags?: string[]) => void;
  reportProblem: (orderId: string, byRole: Role, reason: ReportReason, comment?: string) => void;
}

const mkId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set, get) => ({
      reviews: [],
      reports: [],
      customerRating: 4.9,
      customerRatingCount: 24,

      rateDriver: (orderId, driverId, rating, comment, tip = 0, tags) => {
        const review: Review = {
          id: mkId('rv'), orderId, customerId: 'u-cust-1', driverId,
          rating, comment, tags, raterRole: 'customer', createdAt: new Date().toISOString(),
        };
        set((s) => ({ reviews: [review, ...s.reviews] }));
        if (tip > 0) notify('driver', 'n.tip', 'n.tipB', [tip], { orderId });
        notify('driver', 'n.rate', 'n.rateB', [rating], { orderId });
      },

      rateCustomer: (orderId, customerId, rating, comment, tags) => {
        const review: Review = {
          id: mkId('rv'), orderId, customerId, driverId: 'u-drv-1',
          rating, comment, tags, raterRole: 'driver', createdAt: new Date().toISOString(),
        };
        // Пересчёт среднего рейтинга клиента
        const { customerRating, customerRatingCount } = get();
        const total = customerRating * customerRatingCount + rating;
        const count = customerRatingCount + 1;
        set((s) => ({
          reviews: [review, ...s.reviews],
          customerRating: Math.round((total / count) * 10) / 10,
          customerRatingCount: count,
        }));
        notify('customer', 'n.rate', 'n.rateB', [rating], { orderId });
      },

      reportProblem: (orderId, byRole, reason, comment) => {
        const report: OrderReport = {
          id: mkId('rp'), orderId, byRole, reason, comment,
          status: 'open', createdAt: new Date().toISOString(),
        };
        set((s) => ({ reports: [report, ...s.reports] }));
        // Уведомление в поддержку/админку + подтверждение отправителю
        notify('admin', 'rep.adminTitle', 'rep.adminBody', [], { orderId });
        notify(byRole, 'rep.sentTitle', 'rep.sentBody', [], { orderId });
      },
    }),
    {
      name: 'pakujgo-community',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        reviews: s.reviews, reports: s.reports,
        customerRating: s.customerRating, customerRatingCount: s.customerRatingCount,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<CommunityState>) }),
    },
  ),
);
