import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Row, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatVnd } from '@/lib/format';
import { DRIVER_EARNINGS } from '@/lib/mock';

export default function EarningsScreen() {
  const e = DRIVER_EARNINGS;
  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        <Text style={ui.h1}>Thu nhập</Text>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Hôm nay</Text>
          <Text style={styles.heroValue}>{formatVnd(e.today)}</Text>
          <Text style={styles.heroLabel}>{e.todayTrips} chuyến</Text>
        </View>
        <View style={ui.card}>
          <Text style={ui.muted}>Tuần này</Text>
          <Text style={ui.h2}>{formatVnd(e.week)} · {e.weekTrips} chuyến</Text>
        </View>
        <View style={ui.card}>
          <Text style={[ui.h2, { marginBottom: Spacing.sm }]}>Chuyến gần đây</Text>
          {e.recent.map((r) => (
            <Row
              key={r.id}
              icon="bicycle"
              title={r.route}
              subtitle={r.time}
              right={<Text style={styles.amount}>+{formatVnd(r.amount)}</Text>}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: Colors.driver, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.xs },
  heroLabel: { color: '#DCE8FF', fontSize: 14 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '800' },
  amount: { fontWeight: '700', color: Colors.primary },
});
