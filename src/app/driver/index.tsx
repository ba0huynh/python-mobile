import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMap, MapPin, RouteLine, type CameraRef } from '@/components/app-map';
import { Avatar, BottomCard, Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatKm, formatVnd } from '@/lib/format';
import { boundsOf } from '@/lib/geo';
import { MOCK_REQUEST, VEHICLES } from '@/lib/mock';
import { useSocket } from '@/lib/socket';
import { useCurrentLocation } from '@/lib/use-current-location';

// Driver flow, mocked on the client for now:
// offline -> online (waiting) -> incoming request -> going to pickup -> on trip -> completed
type Step = 'offline' | 'waiting' | 'incoming' | 'toPickup' | 'onTrip' | 'completed';

const ACCEPT_SECONDS = 15;
const SHEET_PADDING = { top: 140, bottom: 380, left: 50, right: 50 };

export default function DriverHomeScreen() {
  const { coord: me } = useCurrentLocation();
  const { addListener, send } = useSocket();
  const cameraRef = useRef<CameraRef>(null);
  const [step, setStep] = useState<Step>('offline');
  const [countdown, setCountdown] = useState(ACCEPT_SECONDS);

  const req = MOCK_REQUEST;
  const online = step !== 'offline';

  // Listen for real-time ride request via WebSocket
  useEffect(() => {
    const unsub = addListener('ride.requested', () => {
      setCountdown(ACCEPT_SECONDS);
      setStep('incoming');
    });
    return unsub;
  }, [addListener]);

  // Send driver GPS location over WebSocket when active
  useEffect(() => {
    if (step === 'waiting' || step === 'toPickup' || step === 'onTrip') {
      send({ type: 'driver.location', lat: me[1], lng: me[0] });
    }
  }, [step, me, send]);

  // A request "arrives" a few seconds after going online.
  useEffect(() => {
    if (step === 'waiting') {
      const t = setTimeout(() => {
        setCountdown(ACCEPT_SECONDS);
        setStep('incoming');
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Auto-decline when the countdown runs out.
  useEffect(() => {
    if (step !== 'incoming') return;
    const t = setTimeout(() => {
      if (countdown <= 1) setStep('waiting');
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (step === 'incoming' || step === 'toPickup') {
      cam.fitBounds(boundsOf(me, req.pickup.coord), { padding: SHEET_PADDING, duration: 800 });
    } else if (step === 'onTrip') {
      cam.fitBounds(boundsOf(req.pickup.coord, req.dropoff.coord), { padding: SHEET_PADDING, duration: 800 });
    } else {
      cam.flyTo({ center: me, zoom: 15, duration: 800 });
    }
  }, [step, me, req]);

  const vehicleName = VEHICLES.find((v) => v.type === req.vehicle)?.name;

  return (
    <View style={ui.screen}>
      <AppMap initialCenter={me} cameraRef={cameraRef}>
        {(step === 'incoming' || step === 'toPickup') && <RouteLine from={me} to={req.pickup.coord} color={Colors.driver} />}
        {step === 'onTrip' && <RouteLine from={req.pickup.coord} to={req.dropoff.coord} color={Colors.driver} />}
        {step !== 'onTrip' && <MapPin id="me" coord={me} kind="driver" />}
        {(step === 'incoming' || step === 'toPickup' || step === 'onTrip') && <MapPin id="pickup" coord={req.pickup.coord} kind="pickup" />}
        {(step === 'incoming' || step === 'onTrip') && <MapPin id="dropoff" coord={req.dropoff.coord} kind="dropoff" />}
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
            <Text style={ui.muted}>Bật trực tuyến để bắt đầu nhận chuyến.</Text>
            <Button title="Bắt đầu nhận chuyến" variant="driver" onPress={() => setStep('waiting')} />
          </>
        )}

        {step === 'waiting' && (
          <>
            <Text style={ui.h2}>Đang tìm chuyến gần bạn...</Text>
            <Text style={ui.muted}>Hôm nay: 9 chuyến · 385.000đ</Text>
            <Button title="Tắt nhận chuyến" variant="secondary" onPress={() => setStep('offline')} />
          </>
        )}

        {step === 'incoming' && (
          <>
            <View style={styles.incomingHeader}>
              <Text style={ui.h2}>Chuyến mới · {vehicleName}</Text>
              <View style={styles.countdown}>
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
            </View>
            <Text style={styles.fare}>{formatVnd(req.fare)} <Text style={ui.muted}>· {formatKm(req.km)} · Tiền mặt</Text></Text>
            <View>
              <Row icon="ellipse" title={req.pickup.name} subtitle={req.pickup.address} />
              <Row icon="location" title={req.dropoff.name} subtitle={req.dropoff.address} />
            </View>
            <View style={styles.actions}>
              <Button title="Bỏ qua" variant="secondary" style={{ flex: 1 }} onPress={() => setStep('waiting')} />
              <Button title="Nhận chuyến" variant="driver" style={{ flex: 2 }} onPress={() => setStep('toPickup')} />
            </View>
          </>
        )}

        {(step === 'toPickup' || step === 'onTrip') && (
          <>
            <Text style={ui.h2}>{step === 'toPickup' ? `Đến điểm đón: ${req.pickup.name}` : `Đưa khách đến: ${req.dropoff.name}`}</Text>
            <View style={styles.customerRow}>
              <Avatar name={req.customerName} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{req.customerName}</Text>
                <Text style={ui.muted}>★ {req.customerRating} · {formatVnd(req.fare)} tiền mặt</Text>
              </View>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="call" size={20} color={Colors.driver} />
              </Pressable>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="chatbubble" size={20} color={Colors.driver} />
              </Pressable>
            </View>
            {step === 'toPickup' ? (
              <Button title="Đã đón khách" variant="driver" onPress={() => setStep('onTrip')} />
            ) : (
              <Button title="Hoàn thành chuyến" variant="driver" onPress={() => setStep('completed')} />
            )}
          </>
        )}

        {step === 'completed' && (
          <>
            <View style={{ alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={ui.h2}>Hoàn thành chuyến</Text>
              <Text style={ui.muted}>Thu tiền mặt từ khách</Text>
              <Text style={styles.fare}>{formatVnd(req.fare)}</Text>
            </View>
            <Button title="Tiếp tục nhận chuyến" variant="driver" onPress={() => setStep('waiting')} />
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
