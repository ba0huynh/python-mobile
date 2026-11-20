import type Ionicons from '@expo/vector-icons/Ionicons';

import type { VehicleType } from './api';

export type { VehicleType };

/** Display metadata only. Prices always come from the backend (/api/rides/estimate/). */
export type VehicleInfo = {
  type: VehicleType;
  name: string;
  seats: number;
  icon: keyof typeof Ionicons.glyphMap;
};

export const VEHICLES: VehicleInfo[] = [
  { type: 'bike', name: 'GoBike', seats: 1, icon: 'bicycle' },
  { type: 'car4', name: 'GoCar 4 chỗ', seats: 4, icon: 'car' },
  { type: 'car7', name: 'GoCar 7 chỗ', seats: 7, icon: 'bus' },
];

export function vehicleInfo(type: VehicleType | undefined | null): VehicleInfo {
  return VEHICLES.find((v) => v.type === type) ?? VEHICLES[0];
}
