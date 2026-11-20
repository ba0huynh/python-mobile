import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMap, MapPin, RouteLine, type CameraRef } from '@/components/app-map';
import { Avatar, BottomCard, Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { confirmAsync, showAlert } from '@/lib/alert';
import {
  api,
  ApiError,
  errorMessage,
  type DriverProfile,
  type Offer,
  type OfferCancelledEvent,
  type RideData,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDuration, formatMeters, formatVnd } from '@/lib/format';
import { boundsOf, boundsOfCoords, type LngLat } from '@/lib/geo';
import { useSocket } from '@/lib/socket';
import { useCurrentLocation } from '@/lib/use-current-location';
import { vehicleInfo } from '@/lib/vehicles';

// Driver flow. Derived from server state (profile status, offer, active ride):
// unapproved | offline -> waiting -> offer -> toPickup -> onTrip -> completed
type Step = 'unapproved' | 'offline' | 'waiting' | 'offer' | 'toPickup' | 'onTrip' | 'completed';

type ShownOffer = Offer & { deadline: number };

const SHEET_PADDING = { top: 140, bottom: 400, left: 50, right: 50 };
const LOCATION_MIN_INTERVAL_MS = 4000;
const LOCATION_HEARTBEAT_MS = 20000;

/** Local deadline from the server expiry, clamped so a skewed phone clock can't break it. */
function withDeadline(o: Offer): ShownOffer {
  const remaining = new Date(o.expires_at).getTime() - Date.now();
  return { ...o, deadline: Date.now() + Math.min(30_000, Math.max(5_000, Number.isFinite(remaining) ? remaining : 15_000)) };
}

function openNavigation(lat: number, lng: number) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() =>
    showAlert('Không mở được bản đồ chỉ đường')
  );
}

export default function DriverHomeScreen() {
  const { coord: me, heading, hasFix, granted } = useCurrentLocation({ watch: true });
  const { driver: storedProfile, driverClient, updateDriverProfile } = useAuth();
  const { addListener, send, connected } = useSocket();
  const cameraRef = useRef<CameraRef>(null);

  const [profile, setProfile] = useState<DriverProfile | null>(storedProfile);
  const [offer, setOffer] = useState<ShownOffer | null>(null);
  const [ride, setRide] = useState<RideData | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const online = profile ? profile.status !== 'OFFLINE' : false;
  const step: Step = ride
    ? ride.status === 'IN_PROGRESS'
      ? 'onTrip'
      : ride.status === 'COMPLETED'
        ? 'completed'
        : 'toPickup'
    : profile && !profile.is_approved
      ? 'unapproved'
      : !online
        ? 'offline'
        : offer
          ? 'offer'
          : 'waiting';

  const saveProfile = (p: DriverProfile) => {
    setProfile(p);
    updateDriverProfile(p);
  };

  const sync = async () => {
    try {
      const [meRes, cur, offers] = await Promise.all([
        api.auth.driver.me(driverClient),
        api.rides.current(driverClient),
        api.driver.offers(driverClient).catch(() => ({ offers: [] as Offer[] })),
      ]);
      saveProfile(meRes);
      setRide((prev) => {
        if (cur.ride) return prev?.id === cur.ride.id ? { ...prev, ...cur.ride } : cur.ride;
        return prev?.status === 'COMPLETED' ? prev : null;
      });
      const o = offers.offers[0];
      setOffer((prev) => (!o || cur.ride ? null : prev?.offer_id === o.offer_id ? prev : withDeadline(o)));
    } catch {
      // Offline; retried on reconnect / foreground.
    }
  };

  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  useEffect(() => {
    syncRef.current();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncRef.current();
    });
    return () => sub.remove();
  }, []);

  // Socket events (re-subscribed every render so handlers see current state).
  useEffect(() => {
    const offs = [
      addListener('connected', () => {
        sync();
      }),
      addListener('ride.offer', (d: Offer) => {
        if (!ride && online) setOffer(withDeadline(d));
      }),
      addListener('ride.offer_cancelled', (d: OfferCancelledEvent) => {
        if (offer && (offer.offer_id === d.offer_id || offer.ride_id === d.ride_id)) setOffer(null);
      }),
      addListener('ride.updated', (d: RideData) => {
        if (!ride || d.id !== ride.id) return;
        // PENDING = we gave the ride back; CANCELLED = the customer cancelled.
        if (d.status === 'CANCELLED' || d.status === 'PENDING') setRide(null);
        else setRide((prev) => (prev ? { ...prev, ...d } : d));
      }),
    ];
    return () => offs.forEach((off) => off());
  });

  // Offer countdown + local expiry.
  const offerDeadline = offer?.deadline;
  useEffect(() => {
    if (!offerDeadline) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= offerDeadline) setOffer(null);
    }, 500);
    return () => clearInterval(t);
  }, [offerDeadline]);

  // --- Live location streaming ----------------------------------------------------------
  const tracking = hasFix && (online || Boolean(ride && ride.status !== 'COMPLETED'));
  const lastSentRef = useRef(0);
  const locationRef = useRef({ me, heading });
  useEffect(() => {
    locationRef.current = { me, heading };
  });

  const pushLocation = (force: boolean) => {
    const t = Date.now();
    if (!force && t - lastSentRef.current < LOCATION_MIN_INTERVAL_MS) return;
    lastSentRef.current = t;
    const { me: pos, heading: h } = locationRef.current;
    const payload = { lat: pos[1], lng: pos[0], heading: h };
    if (!send({ type: 'driver.location', ...payload })) {
      api.driver.updateLocation(driverClient, payload).catch(() => {});
    }
  };
  const pushRef = useRef(pushLocation);
  useEffect(() => {
    pushRef.current = pushLocation;
  });

  useEffect(() => {
    if (tracking) pushRef.current(false);
  }, [tracking, me, connected]);

  useEffect(() => {
    if (!tracking) return;
    const t = setInterval(() => pushRef.current(true), LOCATION_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [tracking]);

  // --- Map --------------------------------------------------------------------------------
  const target = ride ?? offer?.ride ?? null;
  const pickup: LngLat | null = target ? [target.pickup.lng, target.pickup.lat] : null;
  const dropoff: LngLat | null = target ? [target.dropoff.lng, target.dropoff.lat] : null;

  const cameraKey = `${step}|${hasFix}|${target?.id ?? ''}`;
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    if ((step === 'offer' || step === 'toPickup') && pickup) {
      cam.fitBounds(boundsOf(me, pickup), { padding: SHEET_PADDING, duration: 800 });
    } else if (step === 'onTrip' && pickup && dropoff) {
      const coords = ride?.route?.geometry?.coordinates as LngLat[] | undefined;
      cam.fitBounds(coords?.length ? boundsOfCoords(coords) : boundsOf(pickup, dropoff), {
        padding: SHEET_PADDING,
        duration: 800,
      });
    } else {
      cam.flyTo({ center: me, zoom: 15, duration: 800 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey]);

  // --- Actions ----------------------------------------------------------------------------

  const handleToggleOnline = async (turnOn: boolean) => {
    if (turnOn && !hasFix) {
      showAlert('Chưa xác định được vị trí', 'Vui lòng bật định vị (GPS) để bắt đầu nhận chuyến.');
      return;
    }
    setBusy(true);
    try {
      const p = await api.driver.updateStatus(driverClient, {
        status: turnOn ? 'ONLINE' : 'OFFLINE',
        ...(hasFix ? { lat: me[1], lng: me[0] } : {}),
      });
      saveProfile(p);
      if (!turnOn) setOffer(null);
    } catch (err) {
      showAlert('Không thể đổi trạng thái', errorMessage(err));
      if (err instanceof ApiError && (err.status === 403 || err.status === 400)) sync();
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const accepted = await api.driver.acceptRide(driverClient, offer.ride_id);
      setRide({ ...offer.ride, ...accepted });
      setOffer(null);
    } catch (err) {
      setOffer(null);
      showAlert('Không thể nhận chuyến', errorMessage(err, 'Cuốc xe có thể đã hết hạn hoặc được tài xế khác nhận.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!offer) return;
    const rideId = offer.ride_id;
    setOffer(null);
    try {
      await api.driver.declineRide(driverClient, rideId);
    } catch {
      // The offer expires on the server anyway.
    }
  };

  const handleAdvance = async (status: 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED') => {
    if (!ride) return;
    if (status === 'COMPLETED') {
      const ok = await confirmAsync('Hoàn thành chuyến?', `Xác nhận đã trả khách và thu ${formatVnd(ride.fare)} tiền mặt.`, {
        confirmText: 'Hoàn thành',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const updated = await api.driver.updateRideStatus(driverClient, ride.id, status);
      setRide((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      showAlert('Không thể cập nhật chuyến', errorMessage(err));
      sync();
    } finally {
      setBusy(false);
    }
  };

  const handleDriverCancel = async () => {
    if (!ride) return;
    const ok = await confirmAsync('Hủy chuyến này?', 'Chuyến sẽ được chuyển cho tài xế khác. Hủy nhiều lần có thể ảnh hưởng đến tài khoản của bạn.', {
      confirmText: 'Hủy chuyến',
      cancelText: 'Không',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.rides.cancel(driverClient, ride.id, 'Tài xế hủy chuyến');
      setRide(null);
    } catch (err) {
      showAlert('Không thể hủy chuyến', errorMessage(err));
      sync();
    } finally {
      setBusy(false);
    }
  };

  const contactCustomer = (scheme: 'tel' | 'sms') => {
    const phone = ride?.customer?.phone;
    if (phone) Linking.openURL(`${scheme}:${phone}`).catch(() => showAlert('Không mở được ứng dụng', phone));
  };

  const vehicle = vehicleInfo(target?.vehicle_type ?? profile?.vehicle_type);
  const secondsLeft = offer ? Math.max(0, Math.ceil((offer.deadline - now) / 1000)) : 0;
  const statusLabel = !profile?.is_approved ? 'Chờ duyệt' : ride ? 'Đang chở khách' : online ? 'Đang trực tuyến' : 'Ngoại tuyến';

  return (
    <View style={ui.screen}>
      <AppMap initialCenter={me} cameraRef={cameraRef}>
        {(step === 'offer' || step === 'toPickup') && pickup && (
          <RouteLine
            id="approach"
            geometry={step === 'toPickup' ? (ride?.approach_route?.geometry ?? undefined) : undefined}
            from={me}
            to={pickup}
            color={Colors.driver}
          />
        )}
        {step === 'onTrip' && pickup && dropoff && (
          <RouteLine id="trip" geometry={ride?.route?.geometry} from={pickup} to={dropoff} color={Colors.driver} />
        )}
        <MapPin id="me" coord={me} kind="driver" />
        {(step === 'offer' || step === 'toPickup') && pickup && <MapPin id="pickup" coord={pickup} kind="pickup" />}
        {(step === 'offer' || step === 'onTrip') && dropoff && <MapPin id="dropoff" coord={dropoff} kind="dropoff" />}
      </AppMap>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <View style={[styles.statusPill, { backgroundColor: online && profile?.is_approved ? Colors.primary : Colors.text }]}>
          <View style={[styles.dot, { backgroundColor: online ? '#B6F5CF' : '#9CA3AF' }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        {!connected && online && <Text style={styles.offlineHint}>Đang kết nối lại máy chủ...</Text>}
        {granted === false && <Text style={styles.offlineHint}>Hãy cho phép GoXe truy cập vị trí</Text>}
      </SafeAreaView>

      <BottomCard>
        {step === 'unapproved' && (
          <>
            <View style={styles.centerCol}>
              <Ionicons name="hourglass-outline" size={44} color={Colors.warning} />
              <Text style={ui.h2}>Hồ sơ đang chờ duyệt</Text>
              <Text style={[ui.muted, { textAlign: 'center' }]}>
                GoXe đang kiểm tra giấy phép lái xe và thông tin phương tiện của bạn. Bạn có thể nhận chuyến ngay khi hồ sơ
                được duyệt.
              </Text>
            </View>
            <Button title="Kiểm tra lại" variant="secondary" onPress={() => sync()} />
          </>
        )}

        {step === 'offline' && (
          <>
            <Text style={ui.h2}>Bạn đang ngoại tuyến</Text>
            <Text style={ui.muted}>
              {profile?.full_name ? `Chào ${profile.full_name}. ` : ''}Bật trực tuyến để nhận cuốc {vehicle.name} gần bạn.
            </Text>
            <Button title="Bắt đầu nhận chuyến" variant="driver" loading={busy} onPress={() => handleToggleOnline(true)} />
          </>
        )}

        {step === 'waiting' && (
          <>
            <Text style={ui.h2}>Đang chờ cuốc xe...</Text>
            <Text style={ui.muted}>Giữ ứng dụng mở để nhận cuốc gần vị trí của bạn.</Text>
            <Button title="Tắt nhận chuyến" variant="secondary" loading={busy} onPress={() => handleToggleOnline(false)} />
          </>
        )}

        {step === 'offer' && offer && (
          <>
            <View style={styles.offerHeader}>
              <Text style={ui.h2}>Cuốc mới · {vehicle.name}</Text>
              <View style={styles.countdown}>
                <Text style={styles.countdownText}>{secondsLeft}s</Text>
              </View>
            </View>
            <Text style={styles.fare}>
              {formatVnd(offer.ride.fare)} <Text style={ui.muted}>· Tiền mặt</Text>
            </Text>
            {typeof offer.ride.driver_earning === 'number' && (
              <Text style={ui.muted}>Bạn nhận: {formatVnd(offer.ride.driver_earning)}</Text>
            )}
            <View>
              <Row
                icon="radio-button-on"
                title={offer.ride.pickup.address}
                subtitle={`Đón khách · cách bạn ${formatMeters(offer.distance_to_pickup_m)}`}
              />
              <Row
                icon="location"
                title={offer.ride.dropoff.address}
                subtitle={`${formatMeters(offer.ride.distance_m)} · ~${formatDuration(offer.ride.duration_s)}`}
              />
            </View>
            <View style={styles.actions}>
              <Button title="Bỏ qua" variant="secondary" style={{ flex: 1 }} onPress={handleDecline} />
              <Button title="Nhận chuyến" variant="driver" loading={busy} style={{ flex: 2 }} onPress={handleAccept} />
            </View>
          </>
        )}

        {(step === 'toPickup' || step === 'onTrip') && ride && (
          <>
            <Text style={ui.h2} numberOfLines={2}>
              {step === 'onTrip'
                ? `Đưa khách đến: ${ride.dropoff.address}`
                : ride.status === 'ARRIVED'
                  ? 'Đã đến điểm đón · Chờ khách lên xe'
                  : `Đến điểm đón: ${ride.pickup.address}`}
            </Text>
            <View style={styles.customerRow}>
              <Avatar name={ride.customer?.full_name || 'Khách'} color={Colors.driver} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{ride.customer?.full_name || 'Khách hàng'}</Text>
                <Text style={ui.muted}>Thu {formatVnd(ride.fare)} tiền mặt</Text>
              </View>
              <Pressable style={styles.iconBtn} onPress={() => contactCustomer('tel')}>
                <Ionicons name="call" size={20} color={Colors.driver} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => contactCustomer('sms')}>
                <Ionicons name="chatbubble" size={20} color={Colors.driver} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() =>
                  step === 'onTrip'
                    ? openNavigation(ride.dropoff.lat, ride.dropoff.lng)
                    : openNavigation(ride.pickup.lat, ride.pickup.lng)
                }>
                <Ionicons name="navigate" size={20} color={Colors.driver} />
              </Pressable>
            </View>
            {step === 'onTrip' ? (
              <Button title="Hoàn thành chuyến" variant="driver" loading={busy} onPress={() => handleAdvance('COMPLETED')} />
            ) : ride.status === 'ARRIVED' ? (
              <Button title="Khách đã lên xe · Bắt đầu" variant="driver" loading={busy} onPress={() => handleAdvance('IN_PROGRESS')} />
            ) : (
              <Button title="Đã đến điểm đón" variant="driver" loading={busy} onPress={() => handleAdvance('ARRIVED')} />
            )}
            {step === 'toPickup' && (
              <Button title="Hủy chuyến" variant="secondary" disabled={busy} onPress={handleDriverCancel} />
            )}
          </>
        )}

        {step === 'completed' && ride && (
          <>
            <View style={styles.centerCol}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={ui.h2}>Hoàn thành chuyến</Text>
              <Text style={ui.muted}>Thu tiền mặt từ khách</Text>
              <Text style={styles.bigFare}>{formatVnd(ride.fare)}</Text>
            </View>
            {typeof ride.driver_earning === 'number' && (
              <View style={ui.card}>
                <View style={styles.moneyRow}>
                  <Text style={ui.body}>Thu nhập của bạn</Text>
                  <Text style={[ui.body, styles.bold, { color: Colors.primary }]}>{formatVnd(ride.driver_earning)}</Text>
                </View>
                {typeof ride.commission === 'number' && (
                  <View style={styles.moneyRow}>
                    <Text style={ui.muted}>Phí nền tảng GoXe</Text>
                    <Text style={ui.muted}>{formatVnd(ride.commission)}</Text>
                  </View>
                )}
              </View>
            )}
            <Button title="Tiếp tục nhận chuyến" variant="driver" onPress={() => setRide(null)} />
          </>
        )}
      </BottomCard>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.lg, alignItems: 'center', gap: Spacing.xs },
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
  offlineHint: {
    backgroundColor: Colors.warning,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  centerCol: { alignItems: 'center', gap: Spacing.sm },
  offerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdown: {
    backgroundColor: Colors.driverSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  countdownText: { color: Colors.driver, fontWeight: '800' },
  fare: { fontSize: 22, fontWeight: '800', color: Colors.text },
  bigFare: { fontSize: 28, fontWeight: '800', color: Colors.text },
  actions: { flexDirection: 'row', gap: Spacing.md },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.driverSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bold: { fontWeight: '700' },
});
