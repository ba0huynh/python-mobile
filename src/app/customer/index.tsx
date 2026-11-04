import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMap, MapPin, RouteLine, type CameraRef } from '@/components/app-map';
import { Avatar, BottomCard, Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, type RideData, type RouteData } from '@/lib/api';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { formatKm, formatVnd } from '@/lib/format';
import { boundsOf, boundsOfCoords, distanceKm, type LngLat } from '@/lib/geo';
import {
  estimateFare,
  GEOAPIFY_ROUTE,
  SAVED_PLACES,
  VEHICLES,
  type Place,
  type VehicleType,
} from '@/lib/mock';
import { useCurrentLocation } from '@/lib/use-current-location';

// Booking flow, all mocked on the client for now:
// choose destination -> pick vehicle -> searching -> driver matched -> on trip -> done
type Step = 'choose' | 'confirm' | 'searching' | 'matched' | 'onTrip' | 'done';

const SHEET_PADDING = { top: 120, bottom: 420, left: 50, right: 50 };

export default function CustomerHomeScreen() {
  const { coord: currentLocation } = useCurrentLocation();
  const { customerToken } = useAuth();
  const { addListener } = useSocket();
  const cameraRef = useRef<CameraRef>(null);

  const router = useRouter();
  const [customPickup, setCustomPickup] = useState<LngLat | null>(null);
  const pickup = customPickup ?? currentLocation;

  const [step, setStep] = useState<Step>('choose');
  const [destination, setDestination] = useState<Place | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteData | typeof GEOAPIFY_ROUTE | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>('bike');
  const [query, setQuery] = useState('');
  const [liveDriverCoord, setLiveDriverCoord] = useState<LngLat | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [routeDrawn, setRouteDrawn] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [currentRide, setCurrentRide] = useState<RideData | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  const reset = useCallback(() => {
    setDestination(null);
    setActiveRoute(null);
    setRouteDrawn(false);
    setLoadingRoute(false);
    setCustomPickup(null);
    setLiveDriverCoord(null);
    setCurrentRide(null);
    setIsModalVisible(false);
    setStep('choose');
  }, []);

  // Restore active ride on mount if customer is logged in
  useEffect(() => {
    if (!customerToken) return;
    api.rides.current(customerToken).then((res) => {
      if (res.ride) {
        setCurrentRide(res.ride);
        if (res.ride.route) setActiveRoute(res.ride.route);
        setDestination({
          id: 'active-dest',
          name: res.ride.dropoff.address || 'Điểm đến',
          address: res.ride.dropoff.address || '',
          coord: [res.ride.dropoff.lng, res.ride.dropoff.lat],
        });
        setRouteDrawn(true);
        if (res.ride.vehicle_type) setVehicleType(res.ride.vehicle_type);
        if (res.ride.driver && typeof res.ride.driver.lng === 'number' && typeof res.ride.driver.lat === 'number') {
          setLiveDriverCoord([res.ride.driver.lng, res.ride.driver.lat]);
        }

        if (res.ride.status === 'PENDING') setStep('searching');
        else if (res.ride.status === 'ACCEPTED' || res.ride.status === 'ARRIVED') setStep('matched');
        else if (res.ride.status === 'IN_PROGRESS') setStep('onTrip');
        else if (res.ride.status === 'COMPLETED') setStep('done');
      }
    }).catch(() => {});
  }, [customerToken]);

  useEffect(() => {
    const unsubLocation = addListener('driver.location', (data: { lat?: number; lng?: number }) => {
      if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
        setLiveDriverCoord([data.lng, data.lat]);
      }
    });
    const unsubUpdate = addListener('ride.updated', (data: RideData) => {
      setCurrentRide(data);
      if (data?.route) setActiveRoute(data.route);
      if (data?.driver && typeof data.driver.lng === 'number' && typeof data.driver.lat === 'number') {
        setLiveDriverCoord([data.driver.lng, data.driver.lat]);
      }

      if (data?.status === 'ACCEPTED' || data?.status === 'ARRIVED') {
        setStep('matched');
      } else if (data?.status === 'IN_PROGRESS') {
        setStep('onTrip');
      } else if (data?.status === 'COMPLETED') {
        setStep('done');
      } else if (data?.status === 'CANCELLED') {
        reset();
      }
    });
    return () => {
      unsubLocation();
      unsubUpdate();
    };
  }, [addListener, reset]);

  const km = activeRoute
    ? activeRoute.distance_m / 1000
    : destination
      ? distanceKm(pickup, destination.coord)
      : 0;
  const vehicle = VEHICLES.find((v) => v.type === vehicleType)!;
  const fare = estimateFare(vehicle, km);
  // Mock driver starts a little north-east of the pickup point.
  const driverCoord: LngLat = [pickup[0] + 0.004, pickup[1] + 0.003];

  useEffect(() => {
    if (step === 'choose') cameraRef.current?.flyTo({ center: pickup, zoom: 15, duration: 800 });
  }, [pickup, step]);



  const handlePickDestination = (place: Place, shouldFly = false) => {
    setDestination(place);
    setActiveRoute(null);
    setRouteDrawn(false);
    setIsModalVisible(false);
    setQuery('');
    setStep('confirm');

    if (shouldFly) {
      cameraRef.current?.flyTo({ center: place.coord, zoom: 15, duration: 600 });
    }
  };

  const handleConfirmRoute = async () => {
    if (!destination) return;
    setLoadingRoute(true);

    let activePickup = pickup;
    if (destination.id === 'geoapify-route') {
      activePickup = [106.6846006495482, 10.758240352495491];
      setCustomPickup(activePickup);
      setActiveRoute(GEOAPIFY_ROUTE);
      setRouteDrawn(true);
      setLoadingRoute(false);
      cameraRef.current?.fitBounds(
        boundsOfCoords(GEOAPIFY_ROUTE.geometry.coordinates as LngLat[]),
        { padding: SHEET_PADDING, duration: 800 }
      );
      return;
    }

    cameraRef.current?.fitBounds(boundsOf(activePickup, destination.coord), {
      padding: SHEET_PADDING,
      duration: 800,
    });

    try {
      const res = await api.rides.estimate(
        {
          pickup: { lat: activePickup[1], lng: activePickup[0] },
          dropoff: { lat: destination.coord[1], lng: destination.coord[0] },
        },
        customerToken ?? undefined
      );
      const opt = res.options.find((o) => o.vehicle_type === vehicleType) || res.options[0];
      if (opt?.route?.geometry) {
        setActiveRoute(opt.route);
        if (opt.route.geometry.coordinates?.length) {
          cameraRef.current?.fitBounds(
            boundsOfCoords(opt.route.geometry.coordinates as LngLat[]),
            { padding: SHEET_PADDING, duration: 800 }
          );
        }
      }
    } catch {
      // Straight line fallback
    } finally {
      setRouteDrawn(true);
      setLoadingRoute(false);
    }
  };



  const handleBookRide = async () => {
    if (!destination) return;
    if (!customerToken) {
      Alert.alert(
        'Đăng nhập tài khoản',
        'Bạn cần đăng nhập tài khoản Khách hàng để tiến hành đặt xe.',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Đăng nhập', onPress: () => router.push('/auth/login?role=customer') },
        ]
      );
      return;
    }

    setBookingLoading(true);
    try {
      const res = await api.rides.create(
        {
          vehicle_type: vehicleType,
          pickup: {
            lat: pickup[1],
            lng: pickup[0],
            address: 'Vị trí hiện tại',
          },
          dropoff: {
            lat: destination.coord[1],
            lng: destination.coord[0],
            address: destination.name,
          },
        },
        customerToken
      );
      setCurrentRide(res);
      setStep('searching');
      setIsModalVisible(false);
    } catch (err: any) {
      Alert.alert('Đặt xe thất bại', err.message || 'Vui lòng thử lại sau.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!currentRide || !customerToken) {
      reset();
      return;
    }
    try {
      await api.rides.cancel(currentRide.id, customerToken, 'Khách hàng hủy chuyến');
      reset();
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể hủy chuyến.');
    }
  };

  const handleAutoAccept = async () => {
    if (!currentRide || !customerToken) return;
    try {
      const updated = await api.rides.autoAccept(currentRide.id, customerToken);
      setCurrentRide(updated);
      setStep('matched');
    } catch (err: any) {
      Alert.alert('Thông báo', err.message || 'Chưa thể ghép tài xế.');
    }
  };

  const handleAutoAdvance = async () => {
    if (!currentRide || !customerToken) return;
    try {
      const updated = await api.rides.autoAdvance(currentRide.id, customerToken);
      setCurrentRide(updated);
      if (updated.status === 'IN_PROGRESS') setStep('onTrip');
      else if (updated.status === 'COMPLETED') setStep('done');
    } catch (err: any) {
      Alert.alert('Thông báo', err.message || 'Không thể cập nhật trạng thái.');
    }
  };

  const handleSubmitRating = async () => {
    if (!currentRide || !customerToken) {
      reset();
      return;
    }
    try {
      await api.rides.rate(currentRide.id, ratingStars, customerToken, ratingComment);
    } catch {
      // Rating submitted or completed
    }
    reset();
  };

  const places = SAVED_PLACES.filter((p) =>
    `${p.name} ${p.address}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <View style={ui.screen}>
      <AppMap
        initialCenter={pickup}
        cameraRef={cameraRef}
        onPress={
          step === 'choose' || step === 'confirm'
            ? (c) =>
                handlePickDestination({
                  id: 'pin',
                  name: 'Điểm đã chọn trên bản đồ',
                  address: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`,
                  coord: c,
                })
            : undefined
        }
        onLongPress={
          step === 'choose' || step === 'confirm'
            ? (c) =>
                handlePickDestination({
                  id: 'pin',
                  name: 'Điểm đã chọn trên bản đồ',
                  address: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`,
                  coord: c,
                })
            : undefined
        }>
        {destination && routeDrawn && (
          <RouteLine
            geometry={activeRoute?.geometry}
            from={pickup}
            to={destination.coord}
          />
        )}
        <MapPin id="pickup" coord={pickup} kind="pickup" />
        {destination && <MapPin id="dropoff" coord={destination.coord} kind="dropoff" />}
        {(step === 'matched' || step === 'onTrip') && (
          <MapPin id="driver" coord={liveDriverCoord ?? driverCoord} kind="driver" />
        )}
      </AppMap>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        {destination && (
          <Pressable style={styles.roundBtn} onPress={reset}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
        )}
      </SafeAreaView>

      {/* Floating Confirm / Pick Ride Button on Bottom Right */}
      {(step === 'choose' || step === 'confirm') && !isModalVisible && (
        <View style={styles.fabContainer} pointerEvents="box-none">
          <Pressable
            disabled={loadingRoute}
            style={[styles.confirmFab, !destination && styles.confirmFabEmpty]}
            onPress={() => {
              if (!destination) {
                setIsModalVisible(true);
              } else if (!routeDrawn) {
                handleConfirmRoute();
              } else {
                setIsModalVisible(true);
              }
            }}>
            {loadingRoute ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={
                  !destination
                    ? 'search'
                    : !routeDrawn
                      ? 'navigate-circle'
                      : 'car-sport'
                }
                size={22}
                color={!destination ? Colors.text : '#fff'}
              />
            )}
            <View>
              <Text
                style={[
                  styles.confirmFabText,
                  !destination && styles.confirmFabTextEmpty,
                ]}>
                {!destination
                  ? 'Tìm điểm đến'
                  : !routeDrawn
                    ? (loadingRoute ? 'Đang tạo lộ trình...' : 'Xác nhận điểm đến')
                    : 'Xem giá cước & Chọn xe'}
              </Text>
              {destination && (
                <Text
                  style={styles.confirmFabSubtext}>
                  {!routeDrawn
                    ? destination.name
                    : `${vehicle.name} · ${formatVnd(fare)}`}
                </Text>
              )}
            </View>
            {!loadingRoute && (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={!destination ? Colors.textSecondary : '#fff'}
              />
            )}
          </Pressable>
        </View>
      )}

      {/* Modal Popup (BottomCard) */}
      {((step === 'choose' || step === 'confirm') ? isModalVisible : true) && (
        <BottomCard>
          {(step === 'choose' || step === 'confirm') && (
            <View style={styles.modalHeaderRow}>
              <Text style={ui.h2}>{destination ? 'Chọn phương tiện' : 'Bạn muốn đi đâu?'}</Text>
              <Pressable
                onPress={() => setIsModalVisible(false)}
                style={styles.closeModalBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          )}

          {step === 'choose' && (
          <>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm điểm đến"
                placeholderTextColor={Colors.textSecondary}
                style={styles.searchInput}
              />
            </View>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {places.map((p) => (
                <Row key={p.id} icon="location-outline" title={p.name} subtitle={p.address} onPress={() => handlePickDestination(p, true)} />
              ))}
            </ScrollView>
            <Text style={ui.muted}>Mẹo: nhấn giữ trên bản đồ để chọn điểm đến.</Text>
          </>
        )}

        {step === 'confirm' && destination && (
          <>
            <View>
              <Row icon="ellipse" title="Vị trí hiện tại" subtitle="Điểm đón" />
              <Row
                icon="location"
                title={destination.name}
                subtitle={`${destination.address} · ${formatKm(km)}${
                  activeRoute && 'duration_s' in activeRoute
                    ? ` (~${Math.round(activeRoute.duration_s / 60)} phút)`
                    : ''
                }`}
              />
            </View>
            {VEHICLES.map((v) => {
              const active = v.type === vehicleType;
              return (
                <Pressable key={v.type} onPress={() => setVehicleType(v.type)} style={[styles.vehicle, active && styles.vehicleActive]}>
                  <Ionicons name={v.icon} size={26} color={active ? Colors.primary : Colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>{v.name}</Text>
                    <Text style={ui.muted}>{v.seats} chỗ</Text>
                  </View>
                  <Text style={styles.vehicleFare}>{formatVnd(estimateFare(v, km))}</Text>
                </Pressable>
              );
            })}
            <View style={styles.payRow}>
              <Ionicons name="cash-outline" size={18} color={Colors.primary} />
              <Text style={ui.body}>Tiền mặt</Text>
            </View>
            <Button title={`Đặt ${vehicle.name} · ${formatVnd(fare)}`} loading={bookingLoading} onPress={handleBookRide} />
          </>
        )}

        {step === 'searching' && (
          <>
            <Text style={ui.h2}>Đang tìm tài xế gần bạn...</Text>
            <Text style={ui.muted}>{vehicle.name} · {formatVnd(fare)} · Hệ thống đang phát cuốc</Text>
            <Button title="Đang tìm tài xế..." loading />
            <Button
              title="Ghép tài xế gần nhất"
              variant="driver"
              onPress={handleAutoAccept}
            />
            <Button title="Hủy tìm kiếm" variant="secondary" onPress={handleCancelRide} />
          </>
        )}

        {(step === 'matched' || step === 'onTrip') && destination && (
          <>
            <Text style={ui.h2}>
              {currentRide?.status === 'ARRIVED'
                ? 'Tài xế đã đến điểm đón!'
                : step === 'matched'
                  ? 'Tài xế đang đến điểm đón'
                  : `Đang di chuyển đến ${destination.name}`}
            </Text>
            <View style={styles.driverRow}>
              <Avatar
                name={currentRide?.driver?.full_name || 'Tài xế'}
                color={Colors.driver}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>
                  {currentRide?.driver?.full_name || 'Tài xế GoXe'}
                </Text>
                <Text style={ui.muted}>
                  ★ {currentRide?.driver?.rating || '4.9'} · {currentRide?.driver?.vehicle_name || vehicle.name}
                </Text>
              </View>
              <View style={styles.plate}>
                <Text style={styles.plateText}>
                  {currentRide?.driver?.vehicle_plate || '59X-000.00'}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                title="Gọi"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  if (currentRide?.driver?.phone) {
                    Linking.openURL(`tel:${currentRide.driver.phone}`);
                  }
                }}
              />
              <Button
                title="Nhắn tin"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  if (currentRide?.driver?.phone) {
                    Linking.openURL(`sms:${currentRide.driver.phone}`);
                  }
                }}
              />
            </View>
            {step === 'matched' ? (
              <>
                <Button
                  title={currentRide?.status === 'ARRIVED' ? 'Bắt đầu chuyến đi' : 'Tài xế đã đón'}
                  variant="driver"
                  onPress={handleAutoAdvance}
                />
                <Button title="Hủy chuyến" variant="danger" onPress={handleCancelRide} />
              </>
            ) : (
              <Button title="Đã đến nơi (Hoàn thành)" variant="driver" onPress={handleAutoAdvance} />
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <View style={{ alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={ui.h2}>Chuyến đi hoàn thành</Text>
              <Text style={ui.muted}>Thanh toán tiền mặt {formatVnd(currentRide?.fare || fare)}</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Pressable key={i} onPress={() => setRatingStars(i)}>
                    <Ionicons
                      name={i <= ratingStars ? 'star' : 'star-outline'}
                      size={32}
                      color={Colors.warning}
                    />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder="Nhận xét về tài xế (tùy chọn)..."
                placeholderTextColor={Colors.textSecondary}
                style={styles.ratingInput}
              />
            </View>
            <Button title="Gửi đánh giá & Hoàn tất" onPress={handleSubmitRating} />
          </>
        )}
      </BottomCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.lg },
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    outlineWidth: 0,
  },
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
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  plate: { backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  plateText: { fontWeight: '700', color: Colors.text },
  actions: { flexDirection: 'row', gap: Spacing.md },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 99,
  },
  confirmFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  confirmFabEmpty: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmFabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmFabTextEmpty: {
    color: Colors.text,
  },
  confirmFabSubtext: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
  },
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
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
