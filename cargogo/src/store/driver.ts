import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DriverAccountStatus } from '@/types';
import { MOCK_DRIVER_PROFILE, MOCK_VEHICLE } from '@/mocks';
import { TARIFF } from '@/constants';
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

interface DriverState {
  isOnline: boolean;
  verificationStatus: DriverAccountStatus;
  rating: number;
  totalOrders: number;
  balance: number;
  earnings: { orderId: string; gross: number; commission: number; net: number; tip: number; at: string }[];
  draft: RegistrationDraft;
  vehicle: typeof MOCK_VEHICLE;
  setOnline: (v: boolean) => void;
  updateDraft: (patch: Partial<RegistrationDraft>) => void;
  submitForReview: () => void;
  addEarning: (orderId: string, gross: number, tip?: number) => void;
}

const approveLater = (set: (p: Partial<DriverState>) => void) => {
  // Имитация модерации — одобрение через 6 секунд
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
      earnings: [
        { orderId: 'o-past-1', gross: 138, commission: 25, net: 113, tip: 10, at: '2026-06-20T14:30:00Z' },
      ],
      draft: { step: 1, personal: {}, identityDoc: {}, license: {}, payout: {}, vehicle: {}, vehicleDocs: {}, services: {}, consents: {} },
      vehicle: MOCK_VEHICLE,
      setOnline: (v) => {
        set({ isOnline: v });
        if (v) notify('driver', 'n.online', 'n.onlineB');
      },
      updateDraft: (patch) => set((s: DriverState) => ({ draft: { ...s.draft, ...patch } }) as Partial<DriverState>),
      submitForReview: () => {
        set({ verificationStatus: 'under_review' });
        notify('driver', 'n.review', 'n.reviewB');
        approveLater(set);
      },
      addEarning: (orderId, gross, tip = 0) => {
        const commission = Math.round(gross * TARIFF.commissionPct);
        const net = gross - commission + tip;
        set((s: DriverState) => ({
          balance: s.balance + net,
          totalOrders: s.totalOrders + 1,
          earnings: [{ orderId, gross, commission, net, tip, at: new Date().toISOString() }, ...s.earnings],
        }) as Partial<DriverState>);
      },
    }),
    {
      name: 'cargogo-driver',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        verificationStatus: s.verificationStatus, rating: s.rating, totalOrders: s.totalOrders,
        balance: s.balance, earnings: s.earnings, draft: s.draft,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<DriverState>) }),
      // Если приложение закрыли во время «модерации» — доводим её после рестарта
      onRehydrateStorage: () => (state) => {
        if (state && (state.verificationStatus === 'under_review' || state.verificationStatus === 'submitted')) {
          approveLater((p) => useDriverStore.setState(p));
        }
      },
    },
  ),
);
