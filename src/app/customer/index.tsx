import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMap, MapPin, RouteLine, type CameraRef } from '@/components/app-map';
import { Avatar, BottomCard, Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { confirmAsync, showAlert } from '@/lib/alert';
import {
  api,
  ApiError,
  errorMessage,
  type DriverLocationEvent,
  type EstimateOption,
  type GeoPlace,
  type RideData,
  type RideStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDuration, formatKm, formatMeters, formatVnd } from '@/lib/format';
import { boundsOf, boundsOfCoords, distanceKm, type LngLat } from '@/lib/geo';
import { useSocket } from '@/lib/socket';
import { useCurrentLocation } from '@/lib/use-current-location';
import { vehicleInfo, type VehicleType } from '@/lib/vehicles';

// Booking flow. The step is derived from server state (the ride) when one exists:
// choose destination -> confirm (server fare per vehicle) -> searching -> matched -> onTrip -> done
type Step = 'choose' | 'confirm' | 'searching' | 'matched' | 'onTrip' | 'done';

type Place = { name: string; address: string; coord: LngLat };

const SHEET_PADDING = { top: 120, bottom: 440, left: 50, right: 50 };
// Rough city speed used only for the "driver arrives in ~X min" hint.
const ETA_SPEED_KMH = 22;

function stepForStatus(status: RideStatus): Step {
  switch (status) {
    case 'PENDING':
      return 'searching';
    case 'ACCEPTED':
    case 'ARRIVED':
      return 'matched';
    case 'IN_PROGRESS':
      return 'onTrip';
    default:
      return 'done';
  }
}

function placeLabel(p: Place): string {
  const text = p.address && p.address !== p.name ? `${p.name}, ${p.address}` : p.name;
  return text.slice(0, 255);
}

export default function CustomerHomeScreen() {
  const { coord: myCoord, hasFix, granted } = useCurrentLocation({ watch: true });
  const { customerClient } = useAuth();
  const { addListener, showBanner } = useSocket();
  const cameraRef = useRef<CameraRef>(null);

  const [ride, setRide] = useState<RideData | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [options, setOptions] = useState<EstimateOption[] | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateNonce, setEstimateNonce] = useState(0);
  const [vehicleType, setVehicleType] = useState<VehicleType>('bike');
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [driverPos, setDriverPos] = useState<LngLat | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  const step: Step = ride ? stepForStatus(ride.status) : destination ? 'confirm' : 'choose';
  const pickup: LngLat = ride ? [ride.pickup.lng, ride.pickup.lat] : myCoord;
  const dropoff: LngLat | null = ride ? [ride.dropoff.lng, ride.dropoff.lat] : (destination?.coord ?? null);
  const selected = options?.find((o) => o.vehicle_type === vehicleType) ?? options?.[0] ?? null;
  const pickupKey = `${myCoord[0].toFixed(3)},${myCoord[1].toFixed(3)}`;
  const destKey = destination ? `${destination.coord[0]},${destination.coord[1]}` : '';

  const resetAll = () => {
    setRide(null);
    setDestination(null);
    setOptions(null);
    setEstimateError(null);
    setDriverPos(null);
    setQuery('');
    setResults([]);
    setRatingStars(5);
    setRatingComment('');
  };

  /** Apply a ride coming from REST or the socket. */
  const applyRide = (next: RideData) => {
    if (ride && ride.id !== next.id && next.status === 'CANCELLED') return;
    if (next.status === 'CANCELLED') {
      setRide(null);
      setDriverPos(null);
      if (next.cancelled_by === 'system') {
        // Keep the destination so the customer can try again right away.
        setOptions(null);
        showAlert('Không tìm thấy tài xế', next.cancel_reason || 'Hiện chưa có tài xế phù hợp. Vui lòng thử lại sau.');
      } else {
        resetAll();
      }
      return;
    }
    if (next.status === 'COMPLETED' && next.rating != null) {
      resetAll();
      return;
    }
    if (ride && ride.status !== 'PENDING' && next.status === 'PENDING') {
      showBanner({ title: 'Tài xế đã hủy chuyến', message: 'Đang tìm tài xế khác cho bạn...', type: 'warning' });
    }
    setRide(next);
    if (next.status === 'PENDING') setDriverPos(null);
    else if (typeof next.driver?.lat === 'number' && typeof next.driver?.lng === 'number') {
      setDriverPos([next.driver.lng, next.driver.lat]);
    }
  };

  /** Re-read server state (after reconnect / app foreground) since events may have been missed. */
  const sync = async () => {
    try {
      const res = await api.rides.current(customerClient);
      if (res.ride) applyRide(res.ride);
      else if (ride && ride.status !== 'COMPLETED') applyRide(await api.rides.get(customerClient, ride.id));
    } catch {
      // Offline: the next reconnect tries again.
    }
  };

  // Socket events (re-subscribed every render so handlers see current state).
  useEffect(() => {
    const offs = [
      addListener('ride.updated', (d: RideData) => {
        if (!ride || d.id === ride.id) applyRide(d);
      }),
      addListener('driver.location', (d: DriverLocationEvent) => {
        if (ride && d.ride_id === ride.id && typeof d.lat === 'number') setDriverPos([d.lng, d.lat]);
      }),
      addListener('connected', () => {
        sync();
      }),
    ];
    return () => offs.forEach((off) => off());
  });

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

  // Pickup address from the live position.
  useEffect(() => {
    if (!hasFix || ride) return;
    let cancelled = false;
    api.geo
      .reverse(customerClient, myCoord[1], myCoord[0])
      .then((p) => !cancelled && setPickupAddress(p.address || p.name))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupKey, hasFix, Boolean(ride)]);

  // Destination search (debounced).
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(
      () => {
        if (q.length < 2) {
          setResults([]);
          setSearchingPlaces(false);
          return;
        }
        setSearchingPlaces(true);
        api.geo
          .search(customerClient, q, { lat: myCoord[1], lng: myCoord[0] })
          .then((r) => !cancelled && setResults(r.results))
          .catch(() => !cancelled && setResults([]))
          .finally(() => !cancelled && setSearchingPlaces(false));
      },
      q.length < 2 ? 0 : 350
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Server fare estimate whenever the trip endpoints change.
  useEffect(() => {
    if (ride || !destination || !hasFix) return;
    let cancelled = false;
    api.rides
      .estimate(customerClient, {
        pickup: { lat: myCoord[1], lng: myCoord[0] },
        dropoff: { lat: destination.coord[1], lng: destination.coord[0] },
      })
      .then((res) => {
        if (cancelled) return;
        setOptions(res.options);
        setEstimateError(null);
      })
      .catch((err) => !cancelled && setEstimateError(errorMessage(err, 'Không tính được giá cước.')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey, pickupKey, hasFix, ride?.id, estimateNonce]);

  // Searching countdown.
  useEffect(() => {
    if (step !== 'searching') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Camera: move only when the stage changes, not on every GPS tick.
  const cameraKey = `${step}|${hasFix}|${selected?.route?.id ?? ''}|${driverPos ? 'd' : ''}|${ride?.id ?? ''}`;
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (step === 'choose') {
      cam.flyTo({ center: myCoord, zoom: 15, duration: 800 });
    } else if (step === 'confirm' && dropoff) {
      const coords = selected?.route?.geometry?.coordinates as LngLat[] | undefined;
      cam.fitBounds(coords?.length ? boundsOfCoords(coords) : boundsOf(pickup, dropoff), {
        padding: SHEET_PADDING,
        duration: 800,
      });
    } else if (step === 'searching') {
      cam.flyTo({ center: pickup, zoom: 15, duration: 800 });
    } else if (step === 'matched') {
      if (driverPos) cam.fitBounds(boundsOf(driverPos, pickup), { padding: SHEET_PADDING, duration: 800 });
      else cam.flyTo({ center: pickup, zoom: 15, duration: 800 });
    } else if (step === 'onTrip' && dropoff) {
      const coords = ride?.route?.geometry?.coordinates as LngLat[] | undefined;
      cam.fitBounds(coords?.length ? boundsOfCoords(coords) : boundsOf(pickup, dropoff), {
        padding: SHEET_PADDING,
        duration: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey]);

  // --- Actions -----------------------------------------------------------------------

  const chooseDestination = (place: Place) => {
    setDestination(place);
    setOptions(null);
    setEstimateError(null);
    setQuery('');
    setResults([]);
  };

  const handleMapPress = (c: LngLat) => {
    if (step !== 'choose' && step !== 'confirm') return;
    const fallback = `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`;
    chooseDestination({ name: 'Điểm đã chọn trên bản đồ', address: fallback, coord: c });
    api.geo
      .reverse(customerClient, c[1], c[0])
      .then((p) =>
        setDestination((curr) =>
          curr && curr.coord[0] === c[0] && curr.coord[1] === c[1]
            ? { name: p.name || 'Điểm đã chọn', address: p.address || fallback, coord: c }
            : curr
        )
      )
      .catch(() => {});
  };

  const handleBook = async () => {
    if (!destination || !selected) return;
    if (!hasFix) {
      showAlert('Chưa xác định được vị trí', 'Vui lòng bật định vị để GoXe biết điểm đón của bạn.');
      return;
    }
    setBooking(true);
    try {
      const created = await api.rides.create(customerClient, {
        vehicle_type: selected.vehicle_type,
        pickup: { lat: myCoord[1], lng: myCoord[0], address: (pickupAddress || 'Vị trí của tôi').slice(0, 255) },
        dropoff: { lat: destination.coord[1], lng: destination.coord[0], address: placeLabel(destination) },
      });
      applyRide(created);
    } catch (err) {
      showAlert('Đặt xe thất bại', errorMessage(err));
      if (err instanceof ApiError && err.status === 400) sync();
    } finally {
      setBooking(false);
    }
  };

  const handleCancel = async () => {
    if (!ride) return;
    const ok = await confirmAsync(
      'Hủy chuyến?',
      step === 'searching' ? 'Bạn muốn dừng tìm tài xế?' : 'Tài xế đang trên đường đến đón bạn. Bạn chắc chắn muốn hủy?',
      { confirmText: 'Hủy chuyến', cancelText: 'Không', destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.rides.cancel(customerClient, ride.id, 'Khách hàng hủy chuyến');
      resetAll();
    } catch (err) {
      showAlert('Không thể hủy chuyến', errorMessage(err));
      sync();
    } finally {
      setBusy(false);
    }
  };

  const handleRate = async () => {
    if (!ride) return;
    setBusy(true);
    try {
      await api.rides.rate(customerClient, ride.id, ratingStars, ratingComment.trim());
      resetAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) resetAll();
      else showAlert('Không gửi được đánh giá', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const callDriver = (scheme: 'tel' | 'sms') => {
    const phone = ride?.driver?.phone;
    if (phone) Linking.openURL(`${scheme}:${phone}`).catch(() => showAlert('Không mở được ứng dụng', phone));
  };

  // --- Derived display values -----------------------------------------------------------

  const vehicle = vehicleInfo(ride?.vehicle_type ?? selected?.vehicle_type ?? vehicleType);
  const searchSecondsLeft = ride?.search_expires_at
    ? Math.max(0, Math.round((new Date(ride.search_expires_at).getTime() - now) / 1000))
    : null;
  const driverKm = driverPos ? distanceKm(driverPos, pickup) : null;
  const etaMin = driverKm !== null ? Math.max(1, Math.round(((driverKm * 1.3) / ETA_SPEED_KMH) * 60)) : null;
  const approachGeometry = ride?.approach_route?.geometry;

  return (
    <View style={ui.screen}>
      <AppMap initialCenter={myCoord} cameraRef={cameraRef} onPress={handleMapPress} onLongPress={handleMapPress}>
        {step === 'confirm' && dropoff && (
          <RouteLine id="trip" geometry={selected?.route?.geometry} from={pickup} to={dropoff} />
        )}
        {(step === 'searching' || step === 'onTrip') && dropoff && (
          <RouteLine id="trip" geometry={ride?.route?.geometry} from={pickup} to={dropoff} />
        )}
        {step === 'matched' && (approachGeometry || driverPos) && (
          <RouteLine
            id="approach"
            geometry={approachGeometry}
            from={driverPos ?? undefined}
            to={pickup}
            color={Colors.driver}
          />
        )}
        {step !== 'onTrip' && <MapPin id="pickup" coord={pickup} kind="pickup" />}
        {dropoff && <MapPin id="dropoff" coord={dropoff} kind="dropoff" />}
        {(step === 'matched' || step === 'onTrip') && driverPos && <MapPin id="driver" coord={driverPos} kind="driver" />}
      </AppMap>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        {step === 'confirm' && (
          <Pressable style={styles.roundBtn} onPress={resetAll}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
        )}
        {granted === false && (
          <View style={styles.warnPill}>
            <Ionicons name="location-outline" size={16} color="#fff" />
            <Text style={styles.warnText}>Hãy cho phép GoXe truy cập vị trí để đặt xe</Text>
          </View>
        )}
      </SafeAreaView>

      <BottomCard>
        {step === 'choose' && (
          <>
            <Text style={ui.h2}>Bạn muốn đi đâu?</Text>
            <Row
              icon="radio-button-on"
              title="Điểm đón"
              subtitle={hasFix ? pickupAddress || 'Vị trí hiện tại' : 'Đang xác định vị trí...'}
            />
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Nhập điểm đến"
                placeholderTextColor={Colors.textSecondary}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {searchingPlaces && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>
            {results.length > 0 && (
              <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
                {results.map((p, i) => (
                  <Row
                    key={`${p.lat},${p.lng},${i}`}
                    icon="location-outline"
                    title={p.name}
                    subtitle={p.address}
                    onPress={() => chooseDestination({ name: p.name, address: p.address, coord: [p.lng, p.lat] })}
                  />
                ))}
              </ScrollView>
            )}
            {query.trim().length >= 2 && !searchingPlaces && results.length === 0 && (
              <Text style={ui.muted}>Không tìm thấy địa điểm phù hợp.</Text>
            )}
            <Text style={ui.muted}>Hoặc chạm vào bản đồ để chọn điểm đến.</Text>
          </>
        )}

        {step === 'confirm' && destination && (
          <>
            <View>
              <Row icon="radio-button-on" title="Điểm đón" subtitle={pickupAddress || 'Vị trí hiện tại'} />
              <Row
                icon="location"
                title={destination.name}
                subtitle={
                  selected
                    ? `${formatMeters(selected.distance_m)} · ~${formatDuration(selected.duration_s)}`
                    : destination.address
                }
              />
            </View>
            {estimateError ? (
              <>
                <Text style={styles.errorText}>{estimateError}</Text>
                <Button
                  title="Thử lại"
                  variant="secondary"
                  onPress={() => {
                    setEstimateError(null);
                    setEstimateNonce((n) => n + 1);
                  }}
                />
              </>
            ) : !hasFix ? (
              <Text style={styles.errorText}>
                Chưa xác định được vị trí của bạn. Hãy bật định vị để xem giá cước và đặt xe.
              </Text>
            ) : !options ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={ui.muted}>Đang tính giá cước...</Text>
              </View>
            ) : (
              <>
                {options.map((o) => {
                  const info = vehicleInfo(o.vehicle_type);
                  const active = o.vehicle_type === selected?.vehicle_type;
                  return (
                    <Pressable
                      key={o.vehicle_type}
                      onPress={() => setVehicleType(o.vehicle_type)}
                      style={[styles.vehicle, active && styles.vehicleActive]}>
                      <Ionicons name={info.icon} size={26} color={active ? Colors.primary : Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.vehicleName}>{o.name || info.name}</Text>
                        <Text style={ui.muted}>
                          {o.seats} chỗ ·{' '}
                          {o.drivers_nearby > 0 ? `${o.drivers_nearby} tài xế gần bạn` : 'Không có tài xế gần'}
                        </Text>
                      </View>
                      <Text style={styles.vehicleFare}>{formatVnd(o.fare)}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.payRow}>
                  <Ionicons name="cash-outline" size={18} color={Colors.primary} />
                  <Text style={ui.body}>Tiền mặt</Text>
                </View>
                {selected && (
                  <Button
                    title={`Đặt ${selected.name || vehicle.name} · ${formatVnd(selected.fare)}`}
                    loading={booking}
                    disabled={!hasFix}
                    onPress={handleBook}
                  />
                )}
              </>
            )}
          </>
        )}

        {step === 'searching' && ride && (
          <>
            <View style={styles.searchingHeader}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={ui.h2}>Đang tìm tài xế gần bạn...</Text>
            </View>
            <Text style={ui.muted}>
              {vehicle.name} · {formatVnd(ride.fare)} tiền mặt
              {searchSecondsLeft !== null ? ` · còn ${Math.floor(searchSecondsLeft / 60)}:${String(searchSecondsLeft % 60).padStart(2, '0')}` : ''}
            </Text>
            <Row icon="location" title={ride.dropoff.address} subtitle={`${formatMeters(ride.distance_m)} · ~${formatDuration(ride.duration_s)}`} />
            <Button title="Hủy tìm kiếm" variant="secondary" loading={busy} onPress={handleCancel} />
          </>
        )}

        {(step === 'matched' || step === 'onTrip') && ride && (
          <>
            <Text style={ui.h2}>
              {ride.status === 'ARRIVED'
                ? 'Tài xế đã đến điểm đón!'
                : step === 'matched'
                  ? etaMin !== null
                    ? `Tài xế đến trong ~${etaMin} phút`
                    : 'Tài xế đang đến điểm đón'
                  : `Đang đến ${ride.dropoff.address}`}
            </Text>
            {step === 'matched' && driverKm !== null && ride.status !== 'ARRIVED' && (
              <Text style={ui.muted}>Tài xế cách bạn {formatKm(driverKm)}</Text>
            )}
            {ride.driver && (
              <View style={styles.driverRow}>
                <Avatar name={ride.driver.full_name || 'Tài xế'} color={Colors.driver} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleName}>{ride.driver.full_name}</Text>
                  <Text style={ui.muted}>
                    ★ {Number(ride.driver.rating).toFixed(1)} · {ride.driver.vehicle_name || vehicle.name}
                  </Text>
                </View>
                <View style={styles.plate}>
                  <Text style={styles.plateText}>{ride.driver.vehicle_plate}</Text>
                </View>
              </View>
            )}
            <View style={styles.actions}>
              <Button title="Gọi" variant="secondary" style={{ flex: 1 }} onPress={() => callDriver('tel')} />
              <Button title="Nhắn tin" variant="secondary" style={{ flex: 1 }} onPress={() => callDriver('sms')} />
            </View>
            <Text style={ui.muted}>Thanh toán {formatVnd(ride.fare)} tiền mặt khi kết thúc chuyến.</Text>
            {step === 'matched' && <Button title="Hủy chuyến" variant="danger" loading={busy} onPress={handleCancel} />}
          </>
        )}

        {step === 'done' && ride && (
          <>
            <View style={{ alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={ui.h2}>Chuyến đi hoàn thành</Text>
              <Text style={ui.muted}>Vui lòng thanh toán tiền mặt cho tài xế</Text>
              <Text style={styles.total}>{formatVnd(ride.fare)}</Text>
              <Text style={ui.muted}>Đánh giá {ride.driver?.full_name || 'tài xế'}</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Pressable key={i} onPress={() => setRatingStars(i)} hitSlop={6}>
                    <Ionicons name={i <= ratingStars ? 'star' : 'star-outline'} size={32} color={Colors.warning} />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder="Nhận xét về tài xế (tùy chọn)..."
                placeholderTextColor={Colors.textSecondary}
                maxLength={500}
                style={styles.ratingInput}
              />
            </View>
            <View style={styles.actions}>
              <Button title="Bỏ qua" variant="secondary" style={{ flex: 1 }} onPress={resetAll} />
              <Button title="Gửi đánh giá" style={{ flex: 2 }} loading={busy} onPress={handleRate} />
            </View>
          </>
        )}
      </BottomCard>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.lg, gap: Spacing.sm },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  warnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'center',
    backgroundColor: Colors.danger,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  warnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text, outlineWidth: 0 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  errorText: { color: Colors.danger, fontSize: 14 },
  vehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vehicleActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  vehicleName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  vehicleFare: { fontSize: 15, fontWeight: '700', color: Colors.text },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  searchingHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  plate: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  plateText: { fontWeight: '700', color: Colors.text },
  actions: { flexDirection: 'row', gap: Spacing.md },
  total: { fontSize: 28, fontWeight: '800', color: Colors.text },
  ratingInput: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
});
