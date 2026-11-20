import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { getApiBaseUrl, SessionExpiredError, type Offer, type RideData } from './api';
import { useAuth } from './auth';
import { formatVnd } from './format';
import { useRole } from './role';
import { vehicleInfo } from './vehicles';

export type BannerType = 'info' | 'success' | 'warning' | 'driver';

export type BannerData = {
  id: string;
  title: string;
  message: string;
  type?: BannerType;
  duration?: number;
  onPress?: () => void;
};

type SocketListener = (data: any) => void;

type SocketContextType = {
  connected: boolean;
  banner: BannerData | null;
  showBanner: (banner: Omit<BannerData, 'id'>) => void;
  dismissBanner: () => void;
  /**
   * Subscribe to a server event. The special event `connected` fires after every
   * (re)connect: resync state over REST then, because events may have been missed.
   */
  addListener: (event: string, callback: SocketListener) => () => void;
  /** Returns false when the socket is not open (caller may fall back to REST). */
  send: (payload: Record<string, unknown>) => boolean;
};

const SocketContext = createContext<SocketContextType | null>(null);

const PING_MS = 25_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const CLOSE_UNAUTHORIZED = 4401;

function wsUrl(token: string): string {
  const base = getApiBaseUrl().replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  return `${base}/ws/?token=${encodeURIComponent(token)}`;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const { customer, driver, getValidToken, refreshToken } = useAuth();
  const activeRole = role === 'driver' ? 'driver' : 'customer';
  const signedIn = activeRole === 'driver' ? Boolean(driver) : Boolean(customer);

  const [connected, setConnected] = useState(false);
  const [banner, setBanner] = useState<BannerData | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<SocketListener>>>(new Map());
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (data: Omit<BannerData, 'id'>) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    const id = `${Date.now()}-${Math.random()}`;
    setBanner({ ...data, id });
    bannerTimerRef.current = setTimeout(() => {
      setBanner((curr) => (curr?.id === id ? null : curr));
    }, data.duration ?? 5000);
  };

  const dismissBanner = () => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(null);
  };

  const addListener = (event: string, callback: SocketListener) => {
    const map = listenersRef.current;
    if (!map.has(event)) map.set(event, new Set());
    map.get(event)!.add(callback);
    return () => {
      map.get(event)?.delete(callback);
    };
  };

  const send = (payload: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  };

  const emit = (event: string, data: unknown) => {
    listenersRef.current.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`Socket listener for ${event} failed:`, err);
      }
    });
  };

  const bannerFor = (event: string, data: unknown) => {
    if (event === 'ride.offer' && activeRole === 'driver') {
      const offer = data as Offer;
      showBanner({
        title: 'Cuốc xe mới!',
        message: `${vehicleInfo(offer.ride?.vehicle_type).name} · ${formatVnd(offer.ride?.fare ?? 0)} · cách ${Math.round(
          offer.distance_to_pickup_m ?? 0
        )} m`,
        type: 'driver',
        duration: 6000,
      });
      return;
    }
    if (event !== 'ride.updated') return;
    const ride = data as RideData;
    if (activeRole === 'customer') {
      if (ride.status === 'ACCEPTED') {
        showBanner({
          title: 'Đã tìm thấy tài xế!',
          message: `${ride.driver?.full_name ?? 'Tài xế'} đang đến điểm đón.`,
          type: 'success',
        });
      } else if (ride.status === 'ARRIVED') {
        showBanner({ title: 'Tài xế đã đến điểm đón', message: 'Vui lòng ra xe.', type: 'success', duration: 8000 });
      } else if (ride.status === 'COMPLETED') {
        showBanner({ title: 'Chuyến đi hoàn thành', message: `Vui lòng thanh toán ${formatVnd(ride.fare)} tiền mặt.`, type: 'success' });
      } else if (ride.status === 'CANCELLED' && ride.cancelled_by !== 'customer') {
        showBanner({
          title: 'Chuyến đi đã bị hủy',
          message: ride.cancel_reason || 'Chuyến xe đã kết thúc.',
          type: 'warning',
          duration: 8000,
        });
      }
    } else if (ride.status === 'CANCELLED' && ride.cancelled_by === 'customer') {
      showBanner({ title: 'Khách đã hủy chuyến', message: ride.cancel_reason || 'Chuyến xe đã kết thúc.', type: 'warning' });
    }
  };

  // Latest handlers for the long-lived socket callbacks (avoids stale closures).
  const handlersRef = useRef({ emit, bannerFor });
  useEffect(() => {
    handlersRef.current = { emit, bannerFor };
  });

  useEffect(() => {
    if (!signedIn) return;

    let cancelled = false;
    let attempt = 0;
    let forceRefresh = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt) * (0.8 + Math.random() * 0.4);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    async function connect() {
      if (cancelled) return;
      let token: string;
      try {
        token = forceRefresh ? await refreshToken(activeRole) : await getValidToken(activeRole);
        forceRefresh = false;
      } catch (err) {
        // Session gone: auth state change unmounts this effect. Otherwise (offline) retry.
        if (!(err instanceof SessionExpiredError)) scheduleReconnect();
        return;
      }
      if (cancelled) return;

      const ws = new WebSocket(wsUrl(token));
      socketRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempt = 0;
        setConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, PING_MS);
      };

      ws.onmessage = (event) => {
        let payload: { event?: string; data?: unknown };
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!payload.event || payload.event === 'pong') return;
        handlersRef.current.emit(payload.event, payload.data);
        handlersRef.current.bannerFor(payload.event, payload.data);
      };

      ws.onclose = (event) => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (socketRef.current === ws) socketRef.current = null;
        setConnected(false);
        if (cancelled) return;
        if (event.code === CLOSE_UNAUTHORIZED) forceRefresh = true;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
    // getValidToken/refreshToken only read refs; reconnect when the signed-in identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, activeRole, activeRole === 'driver' ? driver?.id : customer?.id]);

  return (
    <SocketContext.Provider value={{ connected, banner, showBanner, dismissBanner, addListener, send }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}
