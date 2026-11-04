import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (Platform.OS === 'web') {
    return 'http://127.0.0.1:8000';
  }
  if (Platform.OS === 'android') {
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    return host ? `http://${host}:8000` : 'http://10.0.2.2:8000';
  }
  return 'http://127.0.0.1:8000';
}

export type AuthTokens = {
  access: string;
  refresh: string;
};

export type CustomerUser = {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  created_at: string;
};

export type DriverProfile = {
  id: string;
  phone: string;
  full_name: string;
  license_number: string;
  vehicle_plate: string;
  vehicle_type: 'bike' | 'car4' | 'car7';
  vehicle_name?: string;
  status: 'OFFLINE' | 'ONLINE' | 'BUSY';
  is_approved: boolean;
  rating?: string;
  total_trips?: number;
};

export type CustomerAuthResponse = {
  customer: CustomerUser;
  access: string;
  refresh: string;
};

export type DriverAuthResponse = {
  driver: DriverProfile;
  access: string;
  refresh: string;
};

export type RouteData = {
  id: string;
  mode: string;
  distance_m: number;
  duration_s: number;
  provider: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
};

export type EstimateOption = {
  vehicle_type: 'bike' | 'car4' | 'car7';
  name: string;
  seats: number;
  fare: number;
  route: RouteData;
};

export type RideStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type DriverPublic = {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: 'bike' | 'car4' | 'car7';
  vehicle_name?: string;
  vehicle_plate: string;
  rating: string | number;
  lat?: number;
  lng?: number;
};

export type RideData = {
  id: string;
  status: RideStatus;
  vehicle_type: 'bike' | 'car4' | 'car7';
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  distance_m: number;
  duration_s: number;
  fare: number;
  payment_method: string;
  customer?: { id: string; full_name: string; phone: string };
  driver?: DriverPublic | null;
  route?: RouteData | null;
  approach_route?: RouteData | null;
  created_at: string;
  accepted_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string;
  rating?: number | null;
  rating_comment?: string;
};

export type EstimateResponse = {
  options: EstimateOption[];
};

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

function parseErrorMessage(data: unknown): string {
  if (!data) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  if (typeof data === 'string') return data;
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.message === 'string') return obj.message;

    // Collect field errors from DRF
    const messages: string[] = [];
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0) {
        messages.push(`${val.join(', ')}`);
      } else if (typeof val === 'string') {
        messages.push(val);
      }
    }
    if (messages.length > 0) return messages.join('\n');
  }
  return 'Yêu cầu không thành công.';
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Không thể kết nối đến máy chủ (${baseUrl}). Vui lòng kiểm tra backend đã chạy chưa. (${errorMsg})`,
      0
    );
  }

  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get('content-type') || '';
  let responseData: unknown = null;
  if (contentType.includes('application/json')) {
    responseData = await res.json();
  } else {
    responseData = await res.text();
  }

  if (!res.ok) {
    throw new ApiError(parseErrorMessage(responseData), res.status, responseData);
  }

  return responseData as T;
}

export const api = {
  auth: {
    customer: {
      login: (data: { phone: string; password: string }) =>
        request<CustomerAuthResponse>('/api/auth/login/', {
          method: 'POST',
          body: JSON.stringify(data),
        }),

      register: (data: {
        phone: string;
        full_name: string;
        email?: string;
        password: string;
        password_confirm: string;
      }) =>
        request<CustomerAuthResponse>('/api/auth/register/', {
          method: 'POST',
          body: JSON.stringify(data),
        }),

      me: (token: string) =>
        request<CustomerUser>('/api/auth/me/', {
          headers: { Authorization: `Bearer ${token}` },
        }),
    },

    driver: {
      login: (data: { phone: string; password: string }) =>
        request<DriverAuthResponse>('/api/auth/driver/login/', {
          method: 'POST',
          body: JSON.stringify(data),
        }),

      register: (data: {
        phone: string;
        full_name: string;
        license_number: string;
        vehicle_plate: string;
        vehicle_type: 'bike' | 'car4' | 'car7';
        vehicle_name?: string;
        password: string;
        password_confirm: string;
      }) =>
        request<DriverAuthResponse>('/api/auth/driver/register/', {
          method: 'POST',
          body: JSON.stringify(data),
        }),

      me: (token: string) =>
        request<DriverProfile>('/api/auth/driver/me/', {
          headers: { Authorization: `Bearer ${token}` },
        }),
    },

    refresh: (refreshToken: string) =>
      request<AuthTokens>('/api/auth/refresh/', {
        method: 'POST',
        body: JSON.stringify({ refresh: refreshToken }),
      }),

    logout: (accessToken: string, refreshToken: string) =>
      request<void>('/api/auth/logout/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ refresh: refreshToken }),
      }),

    resetPassword: (data: {
      phone: string;
      role?: 'customer' | 'driver';
      otp?: string;
      new_password: string;
      new_password_confirm: string;
    }) =>
      request<{ detail: string }>('/api/auth/reset-password/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  rides: {
    estimate: (
      data: { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } },
      token?: string
    ) =>
      request<EstimateResponse>('/api/rides/estimate/', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify(data),
      }),

    create: (
      data: {
        vehicle_type: 'bike' | 'car4' | 'car7';
        pickup: { lat: number; lng: number; address?: string };
        dropoff: { lat: number; lng: number; address?: string };
      },
      token: string
    ) =>
      request<RideData>('/api/rides/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      }),

    current: (token: string) =>
      request<{ ride: RideData | null }>('/api/rides/current/', {
        headers: { Authorization: `Bearer ${token}` },
      }),

    get: (id: string, token: string) =>
      request<RideData>(`/api/rides/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      }),

    cancel: (id: string, token: string, reason?: string) =>
      request<RideData>(`/api/rides/${id}/cancel/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason || 'Khách hủy chuyến' }),
      }),

    rate: (id: string, rating: number, token: string, comment?: string) =>
      request<RideData>(`/api/rides/${id}/rate/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment: comment || '' }),
      }),

    history: (token: string) =>
      request<RideData[]>('/api/rides/', {
        headers: { Authorization: `Bearer ${token}` },
      }),

    autoAccept: (id: string, token: string) =>
      request<RideData>(`/api/rides/${id}/auto-accept/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),

    autoAdvance: (id: string, token: string) =>
      request<RideData>(`/api/rides/${id}/auto-advance/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
  },

  driver: {
    updateStatus: (
      data: { status: 'ONLINE' | 'OFFLINE'; lat?: number; lng?: number },
      token: string
    ) =>
      request<DriverProfile>('/api/driver/status/', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      }),

    updateLocation: (data: { lat: number; lng: number }, token: string) =>
      request<void>('/api/driver/location/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      }),

    availableRides: (token: string) =>
      request<{ total: number; rides: (RideData & { distance_to_pickup_m: number })[] }>(
        '/api/driver/rides/available/',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      ),

    acceptRide: (rideId: string, token: string) =>
      request<RideData>(`/api/driver/rides/${rideId}/accept/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),

    updateRideStatus: (
      rideId: string,
      status: 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED',
      token: string
    ) =>
      request<RideData>(`/api/driver/rides/${rideId}/update-status/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      }),
  },
};

