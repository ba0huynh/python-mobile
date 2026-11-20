import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, type Earnings, type EarningsPeriod } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatVnd } from '@/lib/format';
import { vehicleInfo } from '@/lib/vehicles';

function PeriodCard({ label, p }: { label: string; p: EarningsPeriod }) {
  return (
    <View style={ui.card}>
      <Text style={ui.muted}>{label}</Text>
      <Text style={ui.h2}>
        {formatVnd(p.net)} · {p.trips} chuyến
      </Text>
      <View style={styles.split}>
        <Text style={ui.muted}>Tổng cước {formatVnd(p.gross)}</Text>
        <Text style={ui.muted}>Phí nền tảng −{formatVnd(p.commission)}</Text>
      </View>
    </View>
  );
}

export default function EarningsScreen() {
  const { driverClient } = useAuth();
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        setData(await api.driver.earnings(driverClient));
        setError(null);
      } catch (err) {
        setError(errorMessage(err, 'Không tải được thu nhập.'));
      } finally {
        setRefreshing(false);
      }
    },
    [driverClient]
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        <Text style={ui.h1}>Thu nhập</Text>
        {!data ? (
          error ? (
            <View style={{ gap: Spacing.md }}>
              <Text style={ui.muted}>{error}</Text>
              <Button title="Thử lại" variant="secondary" onPress={() => load(false)} />
            </View>
          ) : (
            <ActivityIndicator color={Colors.driver} />
          )
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Thực nhận hôm nay</Text>
              <Text style={styles.heroValue}>{formatVnd(data.today.net)}</Text>
              <Text style={styles.heroLabel}>
                {data.today.trips} chuyến · Tổng cước {formatVnd(data.today.gross)} · Phí −
                {formatVnd(data.today.commission)}
              </Text>
            </View>
            <PeriodCard label="7 ngày qua" p={data.week} />
            <PeriodCard label="Tháng này" p={data.month} />
            <View style={ui.card}>
              <Text style={[ui.h2, { marginBottom: Spacing.sm }]}>Chuyến gần đây</Text>
              {data.recent.length === 0 && <Text style={ui.muted}>Chưa có chuyến hoàn thành.</Text>}
              {data.recent.map((r) => (
                <Row
                  key={r.id}
                  icon={vehicleInfo(r.vehicle_type).icon}
                  title={r.dropoff.address}
                  subtitle={`${formatDateTime(r.completed_at ?? r.created_at)} · cước ${formatVnd(r.fare)}`}
                  right={<Text style={styles.amount}>+{formatVnd(r.driver_earning ?? r.fare)}</Text>}
                />
              ))}
            </View>
            <Text style={ui.muted}>
              Khách thanh toán tiền mặt trực tiếp cho bạn. Phí nền tảng được tính trên mỗi chuyến hoàn thành.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: Colors.driver, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.xs },
  heroLabel: { color: '#DCE8FF', fontSize: 13 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '800' },
  split: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs, flexWrap: 'wrap', gap: Spacing.sm },
  amount: { fontWeight: '700', color: Colors.primary },
});
