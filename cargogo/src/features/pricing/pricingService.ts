import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PRICING_CONFIG } from './pricingConfig';
import { quote, makeSnapshot } from './pricingEngine';
import { computeDemand, DEMAND_SCENARIOS } from './pricingMocks';
import {
  DemandContext, PricingBreakdown, PricingConfig, PricingInput, PricingSnapshot, PricingVehicleType,
} from './pricingTypes';

/**
 * Сервис прайсинга: рабочая конфигурация (редактируется из админ-панели,
 * переживает перезапуск) + активный мок-сценарий спроса (dev-переключатель).
 * requestSeq защищает от гонок: устаревший результат не затирает новый (§11).
 */

interface PricingState {
  config: PricingConfig;
  demandScenarioId: string;
  requestSeq: number;
  setConfig: (patch: Partial<PricingConfig>) => void;
  resetConfig: () => void;
  setDemandScenario: (id: string) => void;
  nextRequestId: () => number;
}

export const usePricingStore = create<PricingState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_PRICING_CONFIG,
      demandScenarioId: DEMAND_SCENARIOS[0].id,
      requestSeq: 0,
      setConfig: (patch) => set((s) => ({
        // каждое изменение тарифа повышает версию — снапшоты старых заказов не трогаются (§12)
        config: { ...s.config, ...patch, version: s.config.version + 1 },
      })),
      resetConfig: () => set({ config: DEFAULT_PRICING_CONFIG }),
      setDemandScenario: (id) => set({ demandScenarioId: id }),
      nextRequestId: () => {
        const id = get().requestSeq + 1;
        set({ requestSeq: id });
        return id;
      },
    }),
    {
      name: 'pakujgo-pricing',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ config: s.config, demandScenarioId: s.demandScenarioId }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<PricingState>) }),
    },
  ),
);

export const getPricingConfig = (): PricingConfig => usePricingStore.getState().config;

export const getDemandContext = (vehicleType: PricingVehicleType, whenISO: string): DemandContext =>
  computeDemand(getPricingConfig(), usePricingStore.getState().demandScenarioId, vehicleType, whenISO);

/** Полный расчёт по текущему тарифу и текущему сценарию спроса */
export function calculateQuote(input: PricingInput): PricingBreakdown {
  const cfg = getPricingConfig();
  const demand = getDemandContext(input.vehicleType, input.whenISO);
  return quote(input, cfg, demand);
}

/** Снапшот при подтверждении заказа (§12) */
export function lockPrice(input: PricingInput): PricingSnapshot {
  return makeSnapshot(calculateQuote(input));
}

/** Заготовка входа расчёта c дефолтами MVP */
export function buildInput(p: Partial<PricingInput> & Pick<PricingInput, 'vehicleType' | 'distanceKm'>): PricingInput {
  return {
    extraStops: 0,
    loaders: 0,
    loaderHours: 1,
    floorsNoElevator: 0,
    waitingMinutes: 0,
    urgent: false,
    whenISO: new Date().toISOString(),
    externalCosts: [],
    tipsGr: 0,
    approvedAdditionsGr: 0,
    ...p,
  };
}
