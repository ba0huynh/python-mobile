import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMap, MapPin, RouteLine, type CameraRef } from '@/components/app-map';
import { Avatar, BottomCard, Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatKm, formatVnd } from '@/lib/format';
import { boundsOf, type LngLat } from '@/lib/geo';
import { VEHICLES } from '@/lib/mock';
import { api, type RideData } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'expo-router';
import { useSocket } from '@/lib/socket';
import { useCurrentLocation } from '@/lib/use-current-location';

// Driver flow, mocked on the client for now:
// offline -> online (waiting) -> incoming request -> going to pickup -> on trip -> completed
type Step = 'offline' | 'waiting' | 'incoming' | 'toPickup' | 'onTrip' | 'completed';

const ACCEPT_SECONDS = 15;
const SHEET_PADDING = { top: 140, bottom: 380, left: 50, right: 50 };

export default function DriverHomeScreen() {
  const router = useRouter();
  const { coord: me } = useCurrentLocation();
  const { driverToken, driver } = useAuth();
  const { addListener, send } = useSocket();
  const cameraRef = useRef<CameraRef>(null);

  const [step, setStep] = useState<Step>('offline');
  const [countdown, setCountdown] = useState(ACCEPT_SECONDS);
  const [incomingRide, setIncomingRide] = useState<RideData | null>(null);
  const [activeRide, setActiveRide] = useState<RideData | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const online = step !== 'offline';

  // Restore current active ride on mount
  useEffect(() => {
    if (!driverToken) return;
    api.rides.current(driverToken).then((res) => {
      if (res.ride) {
        setActiveRide(res.ride);
        setStep(res.ride.status === 'IN_PROGRESS' ? 'onTrip' : 'toPickup');
      }
    }).catch(() => {});
  }, [driverToken]);

  // Listen for real-time ride requests via WebSocket
  useEffect(() => {
    const unsubReq = addListener('ride.requested', (data: RideData) => {
      if (step === 'waiting') {
        setIncomingRide(data);
        setCountdown(ACCEPT_SECONDS);
        setStep('incoming');
      }
    });

    const unsubUnavail = addListener('ride.unavailable', (data: { id?: string }) => {
      if (incomingRide && incomingRide.id === data.id) {
        setIncomingRide(null);
        setStep('waiting');
      }
    });

    const unsubUpdate = addListener('ride.updated', (data: RideData) => {
      if (data?.status === 'CANCELLED') {
        setActiveRide(null);
        setIncomingRide(null);
        setStep('waiting');
      } else if (activeRide && activeRide.id === data.id) {
        setActiveRide(data);
      }
    });

    return () => {
      unsubReq();
      unsubUnavail();
      unsubUpdate();
    };
  }, [addListener, step, incomingRide, activeRide]);

  // Periodically send driver GPS location over WebSocket and backend
  useEffect(() => {
    if (step === 'waiting' || step === 'toPickup' || step === 'onTrip') {
      send({ type: 'driver.location', lat: me[1], lng: me[0] });
    }
  }, [step, me, send]);

  // Auto-decline when the countdown runs out
  useEffect(() => {
    if (step !== 'incoming') return;
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setIncomingRide(null);
        setStep('waiting');
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  const targetRide = activeRide || incomingRide;
  const pickupLng = targetRide?.pickup?.lng;
  const pickupLat = targetRide?.pickup?.lat;
  const dropoffLng = targetRide?.dropoff?.lng;
  const dropoffLat = targetRide?.dropoff?.lat;

  const pickupCoord: LngLat | null = useMemo(() => {
    return typeof pickupLng === 'number' && typeof pickupLat === 'number'
      ? [pickupLng, pickupLat]
      : null;
  }, [pickupLng, pickupLat]);

  const dropoffCoord: LngLat | null = useMemo(() => {
    return typeof dropoffLng === 'number' && typeof dropoffLat === 'number'
      ? [dropoffLng, dropoffLat]
      : null;
  }, [dropoffLng, dropoffLat]);

  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    if ((step === 'incoming' || step === 'toPickup') && pickupCoord) {
      cam.fitBounds(boundsOf(me, pickupCoord), { padding: SHEET_PADDING, duration: 800 });
    } else if (step === 'onTrip' && pickupCoord && dropoffCoord) {
      cam.fitBounds(boundsOf(pickupCoord, dropoffCoord), { padding: SHEET_PADDING, duration: 800 });
    } else {
      cam.flyTo({ center: me, zoom: 15, duration: 800 });
    }
  }, [step, me, pickupCoord, dropoffCoord]);

  const handleToggleOnline = async (turnOn: boolean) => {
    if (!driverToken) {
      Alert.alert(
        'Đăng nhập tài xế',
        'Vui lòng đăng nhập tài khoản Tài xế để trực tuyến nhận chuyến.',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Đăng nhập', onPress: () => router.push('/auth/login?role=driver') },
        ]
      );
      return;
    }

    try {
      await api.driver.updateStatus(
        {
          status: turnOn ? 'ONLINE' : 'OFFLINE',
          lat: me[1],
          lng: me[0],
        },
        driverToken
      );
      setStep(turnOn ? 'waiting' : 'offline');
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể cập nhật trạng thái.');
    }
  };

  const handleAcceptRide = async () => {
    if (!incomingRide || !driverToken) return;
    setLoadingAction(true);
    try {
      const accepted = await api.driver.acceptRide(incomingRide.id, driverToken);
      setActiveRide(accepted);
      setIncomingRide(null);
      setStep('toPickup');
    } catch (err: any) {
      Alert.alert('Không thể nhận chuyến', err.message || 'Cuốc xe có thể đã được tài xế khác nhận.');
      setIncomingRide(null);
      setStep('waiting');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAdvanceStatus = async (nextStatus: 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED') => {
    if (!activeRide || !driverToken) return;
    setLoadingAction(true);
    try {
      const updated = await api.driver.updateRideStatus(activeRide.id, nextStatus, driverToken);
      setActiveRide(updated);
      if (nextStatus === 'IN_PROGRESS') {
        setStep('onTrip');
      } else if (nextStatus === 'COMPLETED') {
        setStep('completed');
      }
    } catch (err: any) {
      Alert.alert('Lỗi cập nhật', err.message || 'Không thể cập nhật tiến độ chuyến.');
    } finally {
      setLoadingAction(false);
    }
  };

  const vehicleName = VEHICLES.find((v) => v.type === targetRide?.vehicle_type)?.name || 'GoBike';

  return (
    <View style={ui.screen}>
      <AppMap initialCenter={me} cameraRef={cameraRef}>
        {(step === 'incoming' || step === 'toPickup') && pickupCoord && (
          <RouteLine from={me} to={pickupCoord} color={Colors.driver} />
        )}
        {step === 'onTrip' && pickupCoord && dropoffCoord && (
          <RouteLine
            geometry={activeRide?.route?.geometry}
            from={pickupCoord}
            to={dropoffCoord}
            color={Colors.driver}
          />
        )}
        {step !== 'onTrip' && <MapPin id="me" coord={me} kind="driver" />}
        {(step === 'incoming' || step === 'toPickup' || step === 'onTrip') && pickupCoord && (
          <MapPin id="pickup" coord={pickupCoord} kind="pickup" />
        )}
        {(step === 'incoming' || step === 'onTrip') && dropoffCoord && (
          <MapPin id="dropoff" coord={dropoffCoord} kind="dropoff" />
        )}
      </AppMap>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <View style={[styles.statusPill, { backgroundColor: online ? Colors.primary : Colors.text }]}>
          <View style={[styles.dot, { backgroundColor: online ? '#B6F5CF' : '#9CA3AF' }]} />
          <Text style={styles.statusText}>{online ? 'Đang trực tuyến' : 'Ngoại tuyến'}</Text>
        </View>
      </SafeAreaView>

      <BottomCard>
        {step === 'offline' && (
          <>
            <Text style={ui.h2}>Bạn đang ngoại tuyến</Text>
            <Text style={ui.muted}>
              {driver?.full_name ? `Chào ${driver.full_name}. ` : ''}Bật trực tuyến để bắt đầu nhận cuốc từ khách hàng.
            </Text>
            <Button
              title="Bắt đầu nhận chuyến"
              variant="driver"
              onPress={() => handleToggleOnline(true)}
            />
          </>
        )}

        {step === 'waiting' && (
          <>
            <Text style={ui.h2}>Đang tìm chuyến gần bạn...</Text>
            <Text style={ui.muted}>Hệ thống đang kết nối khách hàng quanh Quận 1</Text>
            <Button
              title="Tắt nhận chuyến (Ngoại tuyến)"
              variant="secondary"
              onPress={() => handleToggleOnline(false)}
            />
          </>
        )}

        {step === 'incoming' && incomingRide && (
          <>
            <View style={styles.incomingHeader}>
              <Text style={ui.h2}>Chuyến mới · {vehicleName}</Text>
              <View style={styles.countdown}>
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
            </View>
            <Text style={styles.fare}>
              {formatVnd(incomingRide.fare)}{' '}
              <Text style={ui.muted}>· {formatKm(incomingRide.distance_m / 1000)} · Tiền mặt</Text>
            </Text>
            <View>
              <Row
                icon="ellipse"
                title="Điểm đón khách"
                subtitle={incomingRide.pickup.address || `${incomingRide.pickup.lat}, ${incomingRide.pickup.lng}`}
              />
              <Row
                icon="location"
                title="Điểm đến"
                subtitle={incomingRide.dropoff.address || `${incomingRide.dropoff.lat}, ${incomingRide.dropoff.lng}`}
              />
            </View>
            <View style={styles.actions}>
              <Button
                title="Bỏ qua"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  setIncomingRide(null);
                  setStep('waiting');
                }}
              />
              <Button
                title="Nhận chuyến"
                variant="driver"
                loading={loadingAction}
                style={{ flex: 2 }}
                onPress={handleAcceptRide}
              />
            </View>
          </>
        )}

        {(step === 'toPickup' || step === 'onTrip') && activeRide && (
          <>
            <Text style={ui.h2}>
              {step === 'toPickup'
                ? (activeRide.status === 'ARRIVED' ? 'Đã đến điểm đón · Chờ khách lên xe' : `Đến điểm đón: ${activeRide.pickup.address}`)
                : `Đưa khách đến: ${activeRide.dropoff.address}`}
            </Text>
            <View style={styles.customerRow}>
              <Avatar name={activeRide.customer?.full_name || 'Khách'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{activeRide.customer?.full_name || 'Khách hàng'}</Text>
                <Text style={ui.muted}>{formatVnd(activeRide.fare)} tiền mặt</Text>
              </View>
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  if (activeRide.customer?.phone) {
                    Linking.openURL(`tel:${activeRide.customer.phone}`);
                  }
                }}>
                <Ionicons name="call" size={20} color={Colors.driver} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  if (activeRide.customer?.phone) {
                    Linking.openURL(`sms:${activeRide.customer.phone}`);
                  }
                }}>
                <Ionicons name="chatbubble" size={20} color={Colors.driver} />
              </Pressable>
            </View>
            {step === 'toPickup' ? (
              activeRide.status === 'ARRIVED' ? (
                <Button
                  title="Khách đã lên xe (Bắt đầu đi)"
                  variant="driver"
                  loading={loadingAction}
                  onPress={() => handleAdvanceStatus('IN_PROGRESS')}
                />
              ) : (
                <Button
                  title="Đã đến điểm đón"
                  variant="driver"
                  loading={loadingAction}
                  onPress={() => handleAdvanceStatus('ARRIVED')}
                />
              )
            ) : (
              <Button
                title="Hoàn thành chuyến"
                variant="driver"
                loading={loadingAction}
                onPress={() => handleAdvanceStatus('COMPLETED')}
              />
            )}
          </>
        )}

        {step === 'completed' && activeRide && (
          <>
            <View style={{ alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={ui.h2}>Hoàn thành chuyến</Text>
              <Text style={ui.muted}>Thu tiền mặt từ khách</Text>
              <Text style={styles.fare}>{formatVnd(activeRide.fare)}</Text>
            </View>
            <Button
              title="Tiếp tục nhận chuyến"
              variant="driver"
              onPress={() => {
                setActiveRide(null);
                setStep('waiting');
              }}
            />
          </>
        )}
      </BottomCard>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.lg, alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#fff', fontWeight: '700' },
  incomingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdown: { backgroundColor: Colors.driverSoft, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  countdownText: { color: Colors.driver, fontWeight: '800' },
  fare: { fontSize: 22, fontWeight: '800', color: Colors.text },
  actions: { flexDirection: 'row', gap: Spacing.md },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.driverSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
