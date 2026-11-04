import Ionicons from '@expo/vector-icons/Ionicons';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ui } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { formatVnd } from '@/lib/format';
import { TRIP_HISTORY, VEHICLES } from '@/lib/mock';

export default function TripsScreen() {
  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <Text style={[ui.h1, styles.title]}>Chuyến đi</Text>
      <FlatList
        data={TRIP_HISTORY}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
        renderItem={({ item }) => {
          const vehicle = VEHICLES.find((v) => v.type === item.vehicle);
          const cancelled = item.status === 'cancelled';
          return (
            <View style={ui.card}>
              <View style={styles.top}>
                <Text style={ui.muted}>{item.date} · {vehicle?.name}</Text>
                <Text style={[styles.status, { color: cancelled ? Colors.danger : Colors.primary }]}>
                  {cancelled ? 'Đã hủy' : 'Hoàn thành'}
                </Text>
              </View>
              <View style={styles.line}>
                <Ionicons name="ellipse" size={10} color={Colors.primary} />
                <Text style={ui.body}>{item.from}</Text>
              </View>
              <View style={styles.line}>
                <Ionicons name="location" size={12} color={Colors.danger} />
                <Text style={ui.body}>{item.to}</Text>
              </View>
              {!cancelled && <Text style={styles.fare}>{formatVnd(item.fare)}</Text>}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  status: { fontSize: 13, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  fare: { marginTop: Spacing.sm, fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'right' },
});
