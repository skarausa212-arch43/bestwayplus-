import { VehicleType, OrderStatus } from '@/types';
import { colors } from '@/theme';

export const VEHICLE_TYPES: Record<VehicleType, {
  labelKey: string; descKey: string; color: string; emoji: string;
  maxLength: number; maxWidth: number; maxHeight: number; maxPayload: number;
  basePrice: number; pricePerKm: number;
}> = {
  small_bus: {
    labelKey: 'vehicle.small', descKey: 'vehicle.smallDesc', color: colors.vehicleS, emoji: '🚐',
    maxLength: 3, maxWidth: 1.8, maxHeight: 1.9, maxPayload: 1000,
    basePrice: 25, pricePerKm: 3.5,
  },
  big_bus: {
    labelKey: 'vehicle.big', descKey: 'vehicle.bigDesc', color: colors.vehicleM, emoji: '🚚',
    maxLength: 4.5, maxWidth: 2.1, maxHeight: 2.2, maxPayload: 1500,
    basePrice: 35, pricePerKm: 4.5,
  },
  laweta: {
    labelKey: 'vehicle.laweta', descKey: 'vehicle.lawetaDesc', color: colors.vehicleL, emoji: '🛻',
    maxLength: 4.5, maxWidth: 2.1, maxHeight: 0, maxPayload: 2500,
    basePrice: 80, pricePerKm: 5.5,
  },
};

export const TARIFF = {
  loaderPrice: 40,
  extraStopPrice: 15,
  serviceFeePct: 0.1,
  urgentFee: 20,
  nightMultiplier: 1.3,
  weekendMultiplier: 1.15,
  commissionPct: 0.18,
  winchFee: 60,
};

export const CARGO_CATEGORIES = [
  'meble', 'przeprowadzka', 'agd', 'elektronika', 'palety',
  'materialy_budowlane', 'samochod', 'motocykl', 'maszyny', 'inne',
] as const;

// Порядок статусов, которые водитель переключает вручную (раздел 35 ТЗ)
export const DRIVER_STATUS_FLOW: OrderStatus[] = [
  'accepted', 'driver_en_route', 'driver_arrived', 'loading',
  'in_transit', 'arrived_destination', 'unloading', 'awaiting_confirmation',
];

// §36: тик счётчика ожидания. Production: 1 минута; в HTML-прототипе для демо было 3000 мс.
export const WAIT_TICK_MS = 60_000;

// Быстрые фразы чата — ключи словаря q.0..q.5 (мгновенный перевод на язык зрителя)
export const QUICK_MESSAGE_KEYS = [0, 1, 2, 3, 4, 5].map((i) => `q.${i}`);

export const CANCEL_REASONS_DRIVER = [
  'awaria_pojazdu', 'wypadek', 'niezgodny_ladunek',
  'brak_kontaktu', 'niebezpieczne_warunki', 'problem_z_dokumentami', 'inna',
];
