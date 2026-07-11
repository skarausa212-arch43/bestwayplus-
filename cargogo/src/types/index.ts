export type Role = 'customer' | 'driver' | 'admin';
export type VehicleType = 'small_bus' | 'big_bus' | 'laweta';

export type OrderStatus =
  | 'awaiting_payment' | 'searching' | 'accepted' | 'driver_en_route'
  | 'driver_arrived' | 'waiting' | 'loading' | 'in_transit'
  | 'arrived_destination' | 'unloading' | 'awaiting_confirmation'
  | 'completed' | 'cancelled' | 'dispute';

export type DocStatus = 'draft' | 'uploaded' | 'under_review' | 'approved' | 'rejected' | 'expired';
export type DriverAccountStatus = 'draft' | 'submitted' | 'under_review' | 'action_required' | 'approved' | 'rejected' | 'suspended' | 'blocked';
export type PayoutStatus = 'pending' | 'scheduled' | 'paid' | 'failed' | 'blocked';

export interface User {
  id: string; role: Role; firstName: string; lastName: string;
  phone: string; email: string; avatar?: string;
  status: 'active' | 'blocked'; createdAt: string;
}

export interface Address {
  label?: string; full: string; building?: string; apartment?: string;
  contactName?: string; contactPhone?: string; note?: string;
  lat: number; lng: number;
}

export interface CustomerProfile {
  userId: string; homeAddress?: Address; workAddress?: Address;
  savedAddresses: Address[]; paymentMethods: PaymentMethod[];
}

export interface PaymentMethod {
  id: string; type: 'card' | 'blik' | 'apple_pay' | 'google_pay' | 'company_invoice';
  label: string; isDefault?: boolean;
}

export interface DriverProfile {
  userId: string; birthDate?: string; pesel?: string; nationality?: string;
  address?: string; verificationStatus: DriverAccountStatus;
  rating: number; totalOrders: number; bankIban?: string;
  companyName?: string; nip?: string;
}

export interface DriverDocument {
  id: string; driverId: string;
  type: 'identity' | 'driving_license' | 'registration' | 'oc_insurance' | 'tech_inspection' | 'rental_agreement' | 'leasing' | 'other';
  number?: string; issueDate?: string; expiryDate?: string;
  files: string[]; status: DocStatus; rejectionReason?: string;
}

export interface Vehicle {
  id: string; driverId: string; brand: string; model: string; year: number;
  registrationNumber: string; vin?: string; type: VehicleType;
  dimensions: { length: number; width: number; height: number };
  payload: number; equipment: string[]; photos: string[];
  ownershipType: 'owner' | 'leasing' | 'rental' | 'company' | 'fleet_partner' | 'other';
  verificationStatus: DocStatus;
}

export interface CargoInfo {
  category: string; name: string; description?: string;
  itemsCount: number; weightKg: number;
  length?: number; width?: number; height?: number;
  fragile: boolean; valuable: boolean; needsStraps: boolean;
  loadersCount: number; floorFrom: number; floorTo: number;
  hasElevatorFrom: boolean; hasElevatorTo: boolean; photos: string[];
  // laweta:
  carBrand?: string; carModel?: string; carRunning?: boolean; wheelsBlocked?: boolean;
}

export interface PriceBreakdown {
  transport: number; distance: number; loaders: number;
  extraStops: number; serviceFee: number; urgentFee: number; waiting: number;
  total: number;
}

export interface Order {
  id: string; customerId: string; driverId?: string; vehicleId?: string;
  pickup: Address; destination: Address; stops: Address[];
  cargo: CargoInfo; vehicleType: VehicleType;
  scheduledAt?: string; distanceKm: number;
  price: PriceBreakdown; status: OrderStatus;
  paymentStatus: 'pending' | 'blocked' | 'captured' | 'refunded';
  statusHistory: { status: OrderStatus; at: string }[];
  confirmationCode?: string; createdAt: string;
}

export interface ChatMessage {
  id: string; orderId: string; senderId: string;
  type: 'text' | 'photo' | 'location' | 'system';
  /** Свободный текст (оригинал на языке отправителя) */
  text?: string;
  /** Ключ словаря — быстрые фразы (q.*) и системные сообщения (status.*): рендерятся на языке зрителя */
  key?: string;
  /** Язык оригинала свободного текста */
  lang?: ChatLang;
  /** Автоперевод свободного текста {pl,ru,en} — заполняется сервисом перевода */
  tr?: Partial<Record<ChatLang, string>>;
  /** true, пока перевод в пути */
  pending?: boolean;
  createdAt: string;
}

// Языки, для которых чат хранит автоперевод (как в прототипе)
export type ChatLang = 'pl' | 'ru' | 'en';

// Уведомления хранятся ключами и рендерятся на языке роли-ПОЛУЧАТЕЛЯ
export interface AppNotification {
  id: string; role: Role;
  titleKey: string;
  bodyKey?: string;
  params?: (string | number)[];
  /** Сырой текст вместо bodyKey (например, текст сообщения чата) */
  rawBody?: string;
  orderId?: string; read: boolean; createdAt: string;
}

// §37 — запрос изменения цены водителем
export interface PriceRequest {
  orderId: string;
  amount: number;
  reason: string;
  status: 'pending';
}

export interface DriverPayout {
  id: string; driverId: string; orderId: string;
  grossAmount: number; commission: number; netAmount: number;
  tip: number; status: PayoutStatus; createdAt: string;
}

export interface Review {
  id: string; orderId: string; customerId: string; driverId: string;
  rating: number; comment?: string; createdAt: string;
}
