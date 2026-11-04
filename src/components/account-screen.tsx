import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Row, ui } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useRole } from '@/lib/role';

/** Account tab shared by the customer and driver sides. */
export function AccountScreen() {
  const { role, setRole } = useRole();
  const { customer, driver, customerToken, driverToken, isAuthenticated, logout } = useAuth();
  const isDriver = role === 'driver';

  const switchRole = async () => {
    const nextRole = isDriver ? 'customer' : 'driver';
    await setRole(nextRole);
    if (nextRole === 'driver') {
      if (driver && driverToken) {
        router.replace('/driver');
      } else {
        router.replace('/auth/login?role=driver');
      }
    } else {
      if (customer && customerToken) {
        router.replace('/customer');
      } else {
        router.replace('/auth/login?role=customer');
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace(isDriver ? '/auth/login?role=driver' : '/auth/login?role=customer');
  };

  const handleAuthPress = () => {
    router.push({
      pathname: '/auth/login',
      params: { role: role ?? 'customer' },
    });
  };

  const displayName = isDriver
    ? driver?.full_name || (isAuthenticated ? 'Tài xế GoXe' : 'Khách vãng lai')
    : customer?.full_name || (isAuthenticated ? 'Khách hàng GoXe' : 'Khách vãng lai');

  const displaySubtitle = isDriver
    ? driver ? `Tài xế · ${driver.vehicle_plate} · ${driver.phone}` : 'Tài xế GoXe'
    : customer ? `Khách hàng · ${customer.phone}` : 'Khách hàng GoXe';

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Avatar
            name={displayName}
            color={isDriver ? Colors.driver : Colors.primary}
            size={64}
          />
          <View style={{ flex: 1 }}>
            <Text style={ui.h2}>{displayName}</Text>
            <Text style={ui.muted}>{displaySubtitle}</Text>
          </View>
        </View>

        {!isAuthenticated ? (
          <View style={[ui.card, styles.loginPrompt]}>
            <Text style={ui.h2}>Bạn chưa đăng nhập</Text>
            <Text style={ui.muted}>
              Đăng nhập hoặc đăng ký tài khoản để quản lý chuyến xe và lưu thông tin.
            </Text>
            <Button
              title="Đăng nhập / Đăng ký"
              variant={isDriver ? 'driver' : 'primary'}
              onPress={handleAuthPress}
            />
          </View>
        ) : (
          <View style={ui.card}>
            <Row
              icon="person-outline"
              title="Thông tin tài khoản"
              subtitle={isDriver ? driver?.phone : customer?.email || customer?.phone}
            />
            {isDriver && driver ? (
              <>
                <Row
                  icon="car-outline"
                  title="Phương tiện"
                  subtitle={`${driver.vehicle_name || driver.vehicle_type} (${driver.vehicle_plate})`}
                />
                <Row
                  icon="document-text-outline"
                  title="Bằng lái xe (GPLX)"
                  subtitle={driver.license_number}
                />
                <Row
                  icon="shield-checkmark-outline"
                  title="Trạng thái duyệt"
                  subtitle={driver.is_approved ? 'Đã duyệt' : 'Chờ duyệt'}
                />
              </>
            ) : (
              <>
                <Row
                  icon="card-outline"
                  title="Phương thức thanh toán"
                  subtitle="Tiền mặt"
                />
                <Row
                  icon="bookmark-outline"
                  title="Địa điểm đã lưu"
                  subtitle="Nhà riêng, Cơ quan"
                />
              </>
            )}
            <Row icon="help-circle-outline" title="Trợ giúp & Hỗ trợ" />
          </View>
        )}

        <Button
          title={isDriver ? 'Chuyển sang chế độ Khách hàng' : 'Chuyển sang chế độ Tài xế'}
          variant="secondary"
          onPress={switchRole}
        />

        {isAuthenticated && (
          <Button
            title="Đăng xuất"
            variant="danger"
            onPress={handleLogout}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.md },
  loginPrompt: { gap: Spacing.md },
});
