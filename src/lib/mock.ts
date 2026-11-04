// Mock data used until the backend (be/) exposes ride APIs.
// Replace each export with an API call when the endpoint exists.
import geoapifyRouteData from './geoapify-route.json';
import type { LngLat } from './geo';

export const GEOAPIFY_ROUTE = geoapifyRouteData;

export type VehicleType = 'bike' | 'car4' | 'car7';

export type Vehicle = {
  type: VehicleType;
  name: string;
  seats: number;
  icon: 'bicycle' | 'car' | 'bus';
  baseFare: number; // covers the first 2 km
  perKm: number;
};

export const VEHICLES: Vehicle[] = [
  { type: 'bike', name: 'GoBike', seats: 1, icon: 'bicycle', baseFare: 12000, perKm: 4500 },
  { type: 'car4', name: 'GoCar 4 chỗ', seats: 4, icon: 'car', baseFare: 25000, perKm: 9000 },
  { type: 'car7', name: 'GoCar 7 chỗ', seats: 7, icon: 'bus', baseFare: 30000, perKm: 11000 },
];

export function estimateFare(vehicle: Vehicle, km: number): number {
  return vehicle.baseFare + Math.max(0, km - 2) * vehicle.perKm;
}

export type Place = { id: string; name: string; address: string; coord: LngLat };

export const SAVED_PLACES: Place[] = [
  {
    id: 'geoapify-route',
    name: 'Tuyến mẫu Geoapify',
    address: '10.81483, 106.68664 (Tân Bình / Phú Nhuận)',
    coord: [106.68664363327571, 10.814834555304614],
  },
  { id: 'p1', name: 'Chợ Bến Thành', address: 'Lê Lợi, Quận 1', coord: [106.6981, 10.7725] },
  { id: 'p2', name: 'Landmark 81', address: '720A Điện Biên Phủ, Bình Thạnh', coord: [106.7219, 10.795] },
  { id: 'p3', name: 'Sân bay Tân Sơn Nhất', address: 'Trường Sơn, Tân Bình', coord: [106.6638, 10.8185] },
  { id: 'p4', name: 'ĐH Bách Khoa', address: '268 Lý Thường Kiệt, Quận 10', coord: [106.6576, 10.7726] },
  { id: 'p5', name: 'Phố đi bộ Nguyễn Huệ', address: 'Nguyễn Huệ, Quận 1', coord: [106.7037, 10.7741] },
];

export type Driver = {
  name: string;
  phone: string;
  rating: number;
  vehicleName: string;
  plate: string;
};

export const MOCK_DRIVER: Driver = {
  name: 'Trần Văn Bình',
  phone: '0901 234 567',
  rating: 4.9,
  vehicleName: 'Honda Vision · Đỏ',
  plate: '59X2-123.45',
};

export type RideRequest = {
  id: string;
  customerName: string;
  customerRating: number;
  pickup: Place;
  dropoff: Place;
  vehicle: VehicleType;
  fare: number;
  km: number;
};

export const MOCK_REQUEST: RideRequest = {
  id: 'r-1001',
  customerName: 'Nguyễn Thị Mai',
  customerRating: 4.8,
  pickup: SAVED_PLACES[4],
  dropoff: SAVED_PLACES[1],
  vehicle: 'bike',
  fare: 32000,
  km: 4.2,
};

export type TripHistoryItem = {
  id: string;
  date: string;
  from: string;
  to: string;
  fare: number;
  vehicle: VehicleType;
  status: 'completed' | 'cancelled';
};

export const TRIP_HISTORY: TripHistoryItem[] = [
  { id: 't1', date: '24/10/2026 08:15', from: 'Nhà', to: 'ĐH Bách Khoa', fare: 28000, vehicle: 'bike', status: 'completed' },
  { id: 't2', date: '22/10/2026 18:40', from: 'Landmark 81', to: 'Chợ Bến Thành', fare: 89000, vehicle: 'car4', status: 'completed' },
  { id: 't3', date: '20/10/2026 07:05', from: 'Nhà', to: 'Sân bay Tân Sơn Nhất', fare: 0, vehicle: 'car7', status: 'cancelled' },
];

export const DRIVER_EARNINGS = {
  today: 385000,
  todayTrips: 9,
  week: 2140000,
  weekTrips: 51,
  recent: [
    { id: 'e1', time: '14:20', route: 'Quận 1 → Bình Thạnh', amount: 42000 },
    { id: 'e2', time: '12:55', route: 'Quận 10 → Quận 3', amount: 31000 },
    { id: 'e3', time: '11:30', route: 'Tân Bình → Quận 1', amount: 58000 },
    { id: 'e4', time: '09:10', route: 'Quận 7 → Quận 4', amount: 36000 },
  ],
};
