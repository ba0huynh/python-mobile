import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { getApiBaseUrl } from './api';
import { useAuth } from './auth';
import { useRole } from './role';

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
  addListener: (event: string, callback: SocketListener) => () => void;
  send: (payload: Record<string, unknown>) => void;
};

const SocketContext = createContext<SocketContextType | null>(null);

function getWsUrl(token: string): string {
  const httpUrl = getApiBaseUrl();
  const wsBase = httpUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  return `${wsBase}/ws/?token=${encodeURIComponent(token)}`;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const { customerToken, driverToken } = useAuth();
  const activeToken = role === 'driver' ? driverToken : customerToken;

  const [connected, setConnected] = useState(false);
  const [banner, setBanner] = useState<BannerData | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<SocketListener>>>(new Map());
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (data: Omit<BannerData, 'id'>) => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }
    const id = Date.now().toString();
    const duration = data.duration ?? 5000;
    setBanner({ ...data, id });

    bannerTimerRef.current = setTimeout(() => {
      setBanner((curr) => (curr?.id === id ? null : curr));
    }, duration);
  };

  const dismissBanner = () => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }
    setBanner(null);
  };

  const addListener = (event: string, callback: SocketListener) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);

    return () => {
      listenersRef.current.get(event)?.delete(callback);
    };
  };

  const send = (payload: Record<string, unknown>) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  useEffect(() => {
    if (!activeToken) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    let isCancelled = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (isCancelled) return;

      const wsUrl = getWsUrl(activeToken);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) return;
        setConnected(true);
        // Start heartbeat ping every 25s
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { event: eventName, data } = payload;
          if (!eventName) return;

          // Dispatch to custom registered listeners
          const callbacks = listenersRef.current.get(eventName);
          callbacks?.forEach((cb) => {
            try {
              cb(data);
            } catch (err) {
              console.error(`Error in socket listener for ${eventName}:`, err);
            }
          });

          // Show in-app banner notifications for key ride events
          if (eventName === 'ride.requested') {
            const vehicleLabel =
              data?.vehicle_type === 'bike'
                ? 'GoBike'
                : data?.vehicle_type === 'car7'
                  ? 'GoCar 7 chỗ'
                  : 'GoCar 4 chỗ';
            const dist = data?.distance_to_pickup_m
              ? ` · Cách ${Math.round(data.distance_to_pickup_m)}m`
              : '';
            showBanner({
              title: 'Cuốc xe mới!',
              message: `Khách đặt ${vehicleLabel}${dist}. Nhấn để xem và nhận chuyến.`,
              type: 'driver',
              duration: 8000,
            });
          } else if (eventName === 'ride.unavailable') {
            showBanner({
              title: 'Cuốc xe đã được nhận',
              message: 'Chuyến xe đã được tài xế khác nhận hoặc đã hủy.',
              type: 'warning',
            });
          } else if (eventName === 'ride.updated') {
            const status = data?.status;
            if (status === 'ACCEPTED') {
              if (role === 'customer') {
                showBanner({
                  title: 'Tài xế đã nhận chuyến!',
                  message: `${data.driver?.full_name || 'Tài xế'} đang di chuyển đến điểm đón của bạn.`,
                  type: 'success',
                });
              } else {
                showBanner({
                  title: 'Nhận chuyến thành công',
                  message: 'Hãy di chuyển đến điểm đón khách hàng.',
                  type: 'driver',
                });
              }
            } else if (status === 'ARRIVED') {
              if (role === 'customer') {
                showBanner({
                  title: 'Tài xế đã đến điểm đón!',
                  message: 'Tài xế GoXe đã có mặt tại điểm đón. Vui lòng ra xe.',
                  type: 'success',
                  duration: 8000,
                });
              }
            } else if (status === 'IN_PROGRESS') {
              showBanner({
                title: 'Chuyến đi bắt đầu',
                message: 'Chúc bạn có một chuyến đi an toàn cùng GoXe!',
                type: 'info',
              });
            } else if (status === 'COMPLETED') {
              showBanner({
                title: 'Chuyến đi đã hoàn thành',
                message:
                  role === 'driver'
                    ? `Thu nhập: ${Number(data?.fare || 0).toLocaleString('vi-VN')}đ`
                    : 'Cảm ơn bạn đã đồng hành cùng GoXe!',
                type: 'success',
              });
            } else if (status === 'CANCELLED') {
              showBanner({
                title: 'Chuyến đi đã bị hủy',
                message: data?.cancellation_reason || 'Chuyến xe đã kết thúc.',
                type: 'warning',
              });
            }
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        // Ignored; close handler will trigger reconnect
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        if (!isCancelled) {
          // Reconnect with backoff
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [activeToken, role]);

  return (
    <SocketContext.Provider
      value={{
        connected,
        banner,
        showBanner,
        dismissBanner,
        addListener,
        send,
      }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
