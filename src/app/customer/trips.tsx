import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ui } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, type RideData } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMeters, formatVnd } from '@/lib/format';
import { vehicleInfo } from '@/lib/vehicles';

const PAGE_SIZE = 20;

function statusLabel(ride: RideData): { text: string; color: string } {
  switch (ride.status) {
    case 'COMPLETED':
      return { text: 'Hoàn thành', color: Colors.primary };
    case 'CANCELLED':
      return {
        text:
          ride.cancelled_by === 'system'
            ? 'Không tìm thấy tài xế'
            : ride.cancelled_by === 'driver'
              ? 'Tài xế đã hủy'
              : 'Bạn đã hủy',
        color: Colors.danger,
      };
    case 'PENDING':
      return { text: 'Đang tìm tài xế', color: Colors.warning };
    default:
      return { text: 'Đang diễn ra', color: Colors.driver };
  }
}

export default function TripsScreen() {
  const { customerClient } = useAuth();
  const [rides, setRides] = useState<RideData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const page = await api.rides.list(customerClient, PAGE_SIZE, 0);
        setRides(page.results);
        setTotal(page.count);
        setError(null);
      } catch (err) {
        setError(errorMessage(err, 'Không tải được lịch sử chuyến đi.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customerClient]
  );

  useFocusEffect(
    useCallback(() => {
      loadFirstPage(false);
    }, [loadFirstPage])
  );

  const loadMore = async () => {
    if (loadingMore || rides.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await api.rides.list(customerClient, PAGE_SIZE, rides.length);
      setRides((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.results.filter((r) => !seen.has(r.id))];
      });
      setTotal(page.count);
    } catch {
      // Keep what we have; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <Text style={[ui.h1, styles.title]}>Chuyến đi</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFirstPage(true)} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              {error ? (
                <>
                  <Text style={ui.muted}>{error}</Text>
                  <Button title="Thử lại" variant="secondary" onPress={() => loadFirstPage(false)} />
                </>
              ) : (
                <Text style={ui.muted}>Bạn chưa có chuyến đi nào.</Text>
              )}
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.primary} /> : undefined}
          renderItem={({ item }) => {
            const status = statusLabel(item);
            return (
              <View style={ui.card}>
                <View style={styles.top}>
                  <Text style={ui.muted}>
                    {formatDateTime(item.created_at)} · {vehicleInfo(item.vehicle_type).name}
                  </Text>
                  <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
                </View>
                <View style={styles.line}>
                  <Ionicons name="ellipse" size={10} color={Colors.primary} />
                  <Text style={[ui.body, styles.flex]} numberOfLines={1}>
                    {item.pickup.address}
                  </Text>
                </View>
                <View style={styles.line}>
                  <Ionicons name="location" size={12} color={Colors.danger} />
                  <Text style={[ui.body, styles.flex]} numberOfLines={1}>
                    {item.dropoff.address}
                  </Text>
                </View>
                {item.status === 'COMPLETED' && (
                  <View style={styles.bottom}>
                    <Text style={[ui.muted, styles.flex]} numberOfLines={1}>
                      {formatMeters(item.distance_m)}
                      {item.driver ? ` · ${item.driver.full_name}` : ''}
                      {item.rating ? ` · ★ ${item.rating}` : ''}
                    </Text>
                    <Text style={styles.fare}>{formatVnd(item.fare)}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm, gap: Spacing.sm },
  status: { fontSize: 13, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  flex: { flex: 1 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm, gap: Spacing.sm },
  fare: { fontSize: 16, fontWeight: '700', color: Colors.text },
  empty: { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xl },
});
