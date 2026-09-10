import { User, DriverProfile, Vehicle, Order, CustomerProfile } from '@/types';

export const MOCK_USERS: (User & { password: string })[] = [
  { id: 'u-cust-1', role: 'customer', firstName: 'Anna', lastName: 'Kowalska', phone: '+48 600 100 200', email: 'customer@pakujgo.pl', password: 'Test1234!', status: 'active', createdAt: '2026-01-10T10:00:00Z' },
  { id: 'u-drv-1', role: 'driver', firstName: 'Marek', lastName: 'Kaczmarek', phone: '+48 700 300 400', email: 'driver@pakujgo.pl', password: 'Test1234!', status: 'active', createdAt: '2026-01-05T10:00:00Z' },
  { id: 'u-adm-1', role: 'admin', firstName: 'Admin', lastName: 'PakujGo', phone: '+48 800 500 600', email: 'admin@pakujgo.pl', password: 'Test1234!', status: 'active', createdAt: '2026-01-01T10:00:00Z' },
];

export const MOCK_CUSTOMER_PROFILE: CustomerProfile = {
  userId: 'u-cust-1',
  homeAddress: { label: 'Dom', full: 'Legnicka 58, Wrocław', lat: 51.117, lng: 16.99 },
  workAddress: { label: 'Praca', full: 'Świdnicka 12, Wrocław', lat: 51.106, lng: 17.031 },
  savedAddresses: [],
  paymentMethods: [
    { id: 'pm-1', type: 'card', label: 'Visa •• 5282', isDefault: true },
    { id: 'pm-2', type: 'blik', label: 'BLIK' },
  ],
};

export const MOCK_DRIVER_PROFILE: DriverProfile = {
  userId: 'u-drv-1', verificationStatus: 'approved',
  rating: 4.9, totalOrders: 214, bankIban: 'PL61 1090 1014 0000 0712 1981 2874',
};

export const MOCK_VEHICLE: Vehicle = {
  id: 'v-1', driverId: 'u-drv-1', brand: 'Renault', model: 'Master', year: 2021,
  registrationNumber: 'DW 4521K', type: 'big_bus',
  dimensions: { length: 4.3, width: 2.0, height: 2.1 }, payload: 1400,
  equipment: ['pasy', 'wozek', 'koce'], photos: [],
  ownershipType: 'owner', verificationStatus: 'approved',
};

// Демо-заказ в истории клиента
export const MOCK_PAST_ORDERS: Order[] = [
  {
    id: 'o-past-1', customerId: 'u-cust-1', driverId: 'u-drv-1', vehicleId: 'v-1',
    pickup: { full: 'Grabiszyńska 240, Wrocław', lat: 51.09, lng: 16.97 },
    destination: { full: 'Krzywoustego 110, Wrocław', lat: 51.13, lng: 17.08 },
    stops: [], distanceKm: 11.2,
    cargo: { category: 'meble', name: 'Sofa + fotel', itemsCount: 2, weightKg: 90, fragile: false, valuable: false, needsStraps: true, loadersCount: 1, floorFrom: 3, floorTo: 0, hasElevatorFrom: false, hasElevatorTo: true, photos: [] },
    vehicleType: 'big_bus',
    price: { transport: 35, distance: 50, loaders: 40, extraStops: 0, serviceFee: 13, urgentFee: 0, waiting: 0, total: 138 },
    status: 'completed', paymentStatus: 'captured',
    statusHistory: [{ status: 'completed', at: '2026-06-20T14:30:00Z' }],
    createdAt: '2026-06-20T11:00:00Z',
  },
];
