import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Backend base URL. Production builds must set EXPO_PUBLIC_API_URL
 * (e.g. https://api.goxe.vn). The fallbacks below are for local development only.
 */
export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return 'http://127.0.0.1:8000';
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
}

// --- Types -------------------------------------------------------------------------

export type VehicleType = 'bike' | 'car4' | 'car7';

export type AuthTokens = { access: string; refresh: string };

export type CustomerUser = {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  created_at: string;
};

export type DriverStatus = 'OFFLINE' | 'ONLINE' | 'BUSY';

export type DriverProfile = {
  id: string;
  phone: string;
  full_name: string;
  license_number: string;
  vehicle_plate: string;
  vehicle_type: VehicleType;
  vehicle_name?: string;
  status: DriverStatus;
  is_approved: boolean;
  rating?: number | string;
  lat?: number | null;
  lng?: number | null;
  location_updated_at?: string | null;
  created_at?: string;
};

export type CustomerAuthResponse = AuthTokens & { customer: CustomerUser };
export type DriverAuthResponse = AuthTokens & { driver: DriverProfile };

export type RouteData = {
  id: string;
  mode: string;
  distance_m: number;
  duration_s: number;
  provider: string;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
};

export type EstimateOption = {
  vehicle_type: VehicleType;
  name: string;
  seats: number;
  fare: number;
  distance_m: number;
  duration_s: number;
  route: RouteData;
  drivers_nearby: number;
};

export type RideStatus = 'PENDING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type DriverPublic = {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: VehicleType;
  vehicle_name?: string;
  vehicle_plate: string;
  rating: number | string;
  lat?: number | null;
  lng?: number | null;
};

export type Point = { address: string; lat: number; lng: number };

export type RideData = {
  id: string;
  status: RideStatus;
  vehicle_type: VehicleType;
  pickup: Point;
  dropoff: Point;
  distance_m: number;
  duration_s: number;
  fare: number;
  payment_method: string;
  customer?: { id: string | null; full_name: string; phone: string };
  driver?: DriverPublic | null;
  route?: RouteData | null;
  approach_route?: RouteData | null;
  created_at: string;
  accepted_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: 'customer' | 'driver' | 'system' | '' | null;
  cancel_reason?: string;
  rating?: number | null;
  rating_comment?: string;
  search_expires_at?: string | null;
  driver_earning?: number;
  commission?: number;
};

export type Offer = {
  offer_id: string;
  ride_id: string;
  expires_at: string;
  distance_to_pickup_m: number;
  ride: RideData;
};

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type EarningsPeriod = { trips: number; gross: number; commission: number; net: number };
export type Earnings = { today: EarningsPeriod; week: EarningsPeriod; month: EarningsPeriod; recent: RideData[] };

export type GeoPlace = { name: string; address: string; lat: number; lng: number };

export type DriverLocationEvent = { ride_id: string; lat: number; lng: number; heading?: number | null };
export type OfferCancelledEvent = { ride_id: string; offer_id: string; reason: 'taken' | 'cancelled' | 'expired' };

// --- Errors & transport ------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** Thrown when the refresh token is no longer valid; the session has been cleared. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    this.name = 'SessionExpiredError';
  }
}

export function errorMessage(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function parseErrorMessage(data: unknown): string {
  if (!data) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  if (typeof data === 'string') return data.length > 200 ? 'Máy chủ gặp lỗi. Vui lòng thử lại sau.' : data;
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.message === 'string') return obj.message;
    const messages: string[] = [];
    for (const val of Object.values(obj)) {
      if (Array.isArray(val) && val.length > 0) messages.push(val.join(', '));
      else if (typeof val === 'string') messages.push(val);
    }
    if (messages.length > 0) return messages.join('\n');
  }
  return 'Yêu cầu không thành công.';
}

const TIMEOUT_MS = 20000;

async function request<T>(endpoint: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${endpoint}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.', 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') || '';
  let data: unknown = null;
  try {
    data = contentType.includes('application/json') ? await res.json() : await res.text();
  } catch {
    data = null;
  }

  if (!res.ok) throw new ApiError(parseErrorMessage(data), res.status, data);
  return data as T;
}

/** Supplies (and refreshes) the access token for one signed-in role. See lib/auth.tsx. */
export type AuthClient = {
  getToken: () => Promise<string>;
  refresh: () => Promise<string>;
};

/** Authenticated request: retries once with a refreshed token on 401. */
async function authed<T>(client: AuthClient, endpoint: string, init: RequestInit = {}): Promise<T> {
  const token = await client.getToken();
  try {
    return await request<T>(endpoint, { ...init, token });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const fresh = await client.refresh();
      return request<T>(endpoint, { ...init, token: fresh });
    }
    throw err;
  }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

// --- Endpoints ---------------------------------------------------------------------

export type OtpPurpose = 'register' | 'reset_password';
export type AuthRole = 'customer' | 'driver';

export type CustomerRegisterData = {
  phone: string;
  full_name: string;
  email?: string;
  password: string;
  password_confirm: string;
  otp: string;
};

export type DriverRegisterData = {
  phone: string;
  full_name: string;
  license_number: string;
  vehicle_plate: string;
  vehicle_type: VehicleType;
  vehicle_name?: string;
  password: string;
  password_confirm: string;
  otp: string;
};

export const api = {
  auth: {
    requestOtp: (data: { phone: string; purpose: OtpPurpose; role: AuthRole }) =>
      request<{ detail: string; expires_in: number; resend_in: number }>('/api/auth/otp/request/', json(data)),
    customer: {
      login: (data: { phone: string; password: string }) =>
        request<CustomerAuthResponse>('/api/auth/login/', json(data)),
      register: (data: CustomerRegisterData) => request<CustomerAuthResponse>('/api/auth/register/', json(data)),
      me: (client: AuthClient) => authed<CustomerUser>(client, '/api/auth/me/'),
    },
    driver: {
      login: (data: { phone: string; password: string }) =>
        request<DriverAuthResponse>('/api/auth/driver/login/', json(data)),
      register: (data: DriverRegisterData) => request<DriverAuthResponse>('/api/auth/driver/register/', json(data)),
      me: (client: AuthClient) => authed<DriverProfile>(client, '/api/auth/driver/me/'),
    },
    refresh: (refresh: string) => request<AuthTokens>('/api/auth/refresh/', json({ refresh })),
    logout: (access: string, refresh: string) =>
      request<void>('/api/auth/logout/', { ...json({ refresh }), token: access }),
    resetPassword: (data: {
      phone: string;
      role: AuthRole;
      otp: string;
      new_password: string;
      new_password_confirm: string;
    }) => request<{ detail: string }>('/api/auth/reset-password/', json(data)),
  },

  rides: {
    estimate: (client: AuthClient, data: { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } }) =>
      authed<{ options: EstimateOption[] }>(client, '/api/rides/estimate/', json(data)),
    create: (
      client: AuthClient,
      data: { vehicle_type: VehicleType; pickup: Point; dropoff: Point }
    ) => authed<RideData>(client, '/api/rides/', json(data)),
    current: (client: AuthClient) => authed<{ ride: RideData | null }>(client, '/api/rides/current/'),
    get: (client: AuthClient, id: string) => authed<RideData>(client, `/api/rides/${id}/`),
    list: (client: AuthClient, limit = 20, offset = 0) =>
      authed<Paginated<RideData>>(client, `/api/rides/?limit=${limit}&offset=${offset}`),
    cancel: (client: AuthClient, id: string, reason = '') =>
      authed<RideData>(client, `/api/rides/${id}/cancel/`, json({ reason })),
    rate: (client: AuthClient, id: string, rating: number, comment = '') =>
      authed<RideData>(client, `/api/rides/${id}/rate/`, json({ rating, comment })),
  },

  driver: {
    updateStatus: (client: AuthClient, data: { status: 'ONLINE' | 'OFFLINE'; lat?: number; lng?: number }) =>
      authed<DriverProfile>(client, '/api/driver/status/', { method: 'PATCH', body: JSON.stringify(data) }),
    updateLocation: (client: AuthClient, data: { lat: number; lng: number; heading?: number | null }) =>
      authed<void>(client, '/api/driver/location/', json(data)),
    offers: (client: AuthClient) => authed<{ offers: Offer[] }>(client, '/api/driver/offers/'),
    acceptRide: (client: AuthClient, rideId: string) =>
      authed<RideData>(client, `/api/driver/rides/${rideId}/accept/`, { method: 'POST' }),
    declineRide: (client: AuthClient, rideId: string) =>
      authed<void>(client, `/api/driver/rides/${rideId}/decline/`, { method: 'POST' }),
    updateRideStatus: (client: AuthClient, rideId: string, status: 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED') =>
      authed<RideData>(client, `/api/driver/rides/${rideId}/update-status/`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    earnings: (client: AuthClient) => authed<Earnings>(client, '/api/driver/earnings/'),
  },

  geo: {
    search: (client: AuthClient, q: string, near?: { lat: number; lng: number }) => {
      const params = new URLSearchParams({ q });
      if (near) {
        params.set('lat', String(near.lat));
        params.set('lng', String(near.lng));
      }
      return authed<{ results: GeoPlace[] }>(client, `/api/geo/search/?${params.toString()}`);
    },
    reverse: (client: AuthClient, lat: number, lng: number) =>
      authed<GeoPlace>(client, `/api/geo/reverse/?lat=${lat}&lng=${lng}`),
  },
};
