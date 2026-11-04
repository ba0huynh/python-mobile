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
  },
};

