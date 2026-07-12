import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DriverAccountStatus } from '@/types';
import { MOCK_DRIVER_PROFILE, MOCK_VEHICLE } from '@/mocks';
import { notify } from '@/services/notifications';

export interface RegistrationDraft {
  step: number;
  personal: Record<string, string>;
  identityDoc: Record<string, string>;
  license: Record<string, string>;
  payout: Record<string, string>;
  vehicle: Record<string, string>;
  vehicleDocs: Record<string, string>;
  services: Record<string, string>;
  consents: Record<string, boolean>;
}

// Запись заработка: только выплата и чаевые — комиссия водителю не показывается (§7)
export interface EarningEntry {
  orderId: string;
  payout: number; // PLN, две цифры после запятой
  tip: number;
  at: string;
}

interface DriverState {
  isOnline: boolean;
  verificationStatus: DriverAccountStatus;
  rating: number;
  totalOrders: number;
  balance: number;
  /** Радиус получения заказов, км (настраивается водителем) */
  searchRadiusKm: number;
  /** Мок-позиция водителя (в production — GPS) */
  position: { lat: number; lng: number };
  earnings: EarningEntry[];
  draft: RegistrationDraft;
  vehicle: typeof MOCK_VEHICLE;
  setOnline: (v: boolean) => void;
  setSearchRadius: (km: number) => void;
  updateDraft: (patch: Partial<RegistrationDraft>) => void;
  submitForReview: () => void;
  addEarning: (orderId: string, payout: number, tip?: number) => void;
}

const approveLater = (set: (p: Partial<DriverState>) => void) => {
  setTimeout(() => {
    set({ verificationStatus: 'approved' });
    notify('driver', 'n.approved', 'n.approvedB');
  }, 6000);
};

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      isOnline: false,
      verificationStatus: MOCK_DRIVER_PROFILE.verificationStatus,
      rating: MOCK_DRIVER_PROFILE.rating,
      totalOrders: MOCK_DRIVER_PROFILE.totalOrders,
      balance: 1240,
      searchRadiusKm: 30,
      position: { lat: 51.107, lng: 17.038 }, // Вроцлав, центр
      earnings: [
        { orderId: 'o-past-1', payout: 124.2, tip: 10, at: '2026-06-20T14:30:00Z' },
      ],
      draft: { step: 1, personal: {}, identityDoc: {}, license: {}, payout: {}, vehicle: {}, vehicleDocs: {}, services: {}, consents: {} },
      vehicle: MOCK_VEHICLE,
      setOnline: (v) => {
        set({ isOnline: v });
        if (v) notify('driver', 'n.online', 'n.onlineB');
      },
      setSearchRadius: (km) => set({ searchRadiusKm: Math.min(100, Math.max(5, Math.round(km))) }),
      updateDraft: (patch) => set((s: DriverState) => ({ draft: { ...s.draft, ...patch } }) as Partial<DriverState>),
      submitForReview: () => {
        set({ verificationStatus: 'under_review' });
        notify('driver', 'n.review', 'n.reviewB');
        approveLater((p) => useDriverStore.setState(p));
      },
      addEarning: (orderId, payout, tip = 0) => {
        set((s: DriverState) => ({
          balance: Math.round((s.balance + payout + tip) * 100) / 100,
          totalOrders: s.totalOrders + 1,
          earnings: [{ orderId, payout, tip, at: new Date().toISOString() }, ...s.earnings],
        }) as Partial<DriverState>);
      },
    }),
    {
      name: 'cargogo-driver',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        verificationStatus: s.verificationStatus, rating: s.rating, totalOrders: s.totalOrders,
        balance: s.balance, earnings: s.earnings, draft: s.draft, searchRadiusKm: s.searchRadiusKm,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<DriverState> & { earnings?: any[] };
        // Миграция старых записей заработка {net, gross, commission} → {payout}
        const earnings = (p.earnings ?? current.earnings).map((e: any) => ({
          orderId: e.orderId, payout: e.payout ?? e.net ?? 0, tip: e.tip ?? 0, at: e.at,
        }));
        return { ...current, ...p, earnings };
      },
      onRehydrateStorage: () => (state) => {
        if (state && (state.verificationStatus === 'under_review' || state.verificationStatus === 'submitted')) {
          approveLater((p) => useDriverStore.setState(p));
        }
      },
    },
  ),
);
