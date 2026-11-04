import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMap, MapPin, RouteLine, type CameraRef } from '@/components/app-map';
import { Avatar, BottomCard, Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, type RouteData } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { formatKm, formatVnd } from '@/lib/format';
import { boundsOf, boundsOfCoords, distanceKm, type LngLat } from '@/lib/geo';
import {
  estimateFare,
  GEOAPIFY_ROUTE,
  MOCK_DRIVER,
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

  const [customPickup, setCustomPickup] = useState<LngLat | null>(null);
  const pickup = customPickup ?? currentLocation;

  const [step, setStep] = useState<Step>('choose');
  const [destination, setDestination] = useState<Place | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteData | typeof GEOAPIFY_ROUTE | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>('bike');
  const [query, setQuery] = useState('');
  const [liveDriverCoord, setLiveDriverCoord] = useState<LngLat | null>(null);

  useEffect(() => {
    const unsubLocation = addListener('driver.location', (data: { lat?: number; lng?: number }) => {
      if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
        setLiveDriverCoord([data.lng, data.lat]);
      }
    });
    const unsubUpdate = addListener('ride.updated', (data: { status?: string }) => {
      if (data?.status === 'ACCEPTED') {
        setStep('matched');
      } else if (data?.status === 'IN_PROGRESS') {
        setStep('onTrip');
      } else if (data?.status === 'COMPLETED') {
        setStep('done');
      }
    });
    return () => {
      unsubLocation();
      unsubUpdate();
    };
  }, [addListener]);

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

  useEffect(() => {
    if (step === 'searching') {
      const t = setTimeout(() => setStep('matched'), 3000);
      return () => clearTimeout(t);
    }
  }, [step]);

  const selectDestination = async (place: Place) => {
    setDestination(place);
    setQuery('');
    setStep('confirm');

    let activePickup = pickup;
    if (place.id === 'geoapify-route') {
      activePickup = [106.6846006495482, 10.758240352495491];
      setCustomPickup(activePickup);
      setActiveRoute(GEOAPIFY_ROUTE);
      cameraRef.current?.fitBounds(
        boundsOfCoords(GEOAPIFY_ROUTE.geometry.coordinates as LngLat[]),
        { padding: SHEET_PADDING, duration: 800 }
      );
    } else {
      cameraRef.current?.fitBounds(boundsOf(activePickup, place.coord), {
        padding: SHEET_PADDING,
        duration: 800,
      });
    }

    try {
      const res = await api.rides.estimate(
        {
          pickup: { lat: activePickup[1], lng: activePickup[0] },
          dropoff: { lat: place.coord[1], lng: place.coord[0] },
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
      // Keep existing route or fallback
    }
  };

  const reset = () => {
    setDestination(null);
    setActiveRoute(null);
    setCustomPickup(null);
    setLiveDriverCoord(null);
    setStep('choose');
  };

  const places = SAVED_PLACES.filter((p) =>
    `${p.name} ${p.address}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <View style={ui.screen}>
      <AppMap
        initialCenter={pickup}
        cameraRef={cameraRef}
        onLongPress={
          step === 'choose' || step === 'confirm'
            ? (c) => selectDestination({ id: 'pin', name: 'Điểm đã chọn trên bản đồ', address: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`, coord: c })
            : undefined
        }>
        {destination && (
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
        {step === 'confirm' && (
          <Pressable style={styles.roundBtn} onPress={reset}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
        )}
      </SafeAreaView>

      <BottomCard>
        {step === 'choose' && (
          <>
            <Text style={ui.h2}>Bạn muốn đi đâu?</Text>
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
                <Row key={p.id} icon="location-outline" title={p.name} subtitle={p.address} onPress={() => selectDestination(p)} />
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
            <Button title={`Đặt ${vehicle.name} · ${formatVnd(fare)}`} onPress={() => setStep('searching')} />
          </>
        )}

        {step === 'searching' && (
          <>
            <Text style={ui.h2}>Đang tìm tài xế gần bạn...</Text>
            <Text style={ui.muted}>{vehicle.name} · {formatVnd(fare)}</Text>
            <Button title="Đang tìm" loading />
            <Button title="Hủy" variant="secondary" onPress={() => setStep('confirm')} />
          </>
        )}

        {(step === 'matched' || step === 'onTrip') && destination && (
          <>
            <Text style={ui.h2}>{step === 'matched' ? 'Tài xế đang đến · 3 phút' : `Đang đến ${destination.name}`}</Text>
            <View style={styles.driverRow}>
              <Avatar name={MOCK_DRIVER.name} color={Colors.driver} />
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{MOCK_DRIVER.name}</Text>
                <Text style={ui.muted}>★ {MOCK_DRIVER.rating} · {MOCK_DRIVER.vehicleName}</Text>
              </View>
              <View style={styles.plate}>
                <Text style={styles.plateText}>{MOCK_DRIVER.plate}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button title="Gọi" variant="secondary" style={{ flex: 1 }} />
              <Button title="Nhắn tin" variant="secondary" style={{ flex: 1 }} />
            </View>
            {step === 'matched' ? (
              <>
                <Button title="(Demo) Tài xế đã đón" onPress={() => setStep('onTrip')} />
                <Button title="Hủy chuyến" variant="danger" onPress={reset} />
              </>
            ) : (
              <Button title="(Demo) Đã đến nơi" onPress={() => setStep('done')} />
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <View style={{ alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={ui.h2}>Chuyến đi hoàn thành</Text>
              <Text style={ui.muted}>Thanh toán tiền mặt {formatVnd(fare)}</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Ionicons key={i} name="star" size={28} color={Colors.warning} />
                ))}
              </View>
            </View>
            <Button title="Xong" onPress={reset} />
          </>
        )}
      </BottomCard>
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
});
