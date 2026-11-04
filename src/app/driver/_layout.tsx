import { Redirect, Tabs } from 'expo-router';

import { tabIcon } from '@/components/tab-icon';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function DriverTabs() {
  const { driver, driverToken, ready } = useAuth();

  if (ready && (!driver || !driverToken)) {
    return <Redirect href="/auth/login?role=driver" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: Colors.driver }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Nhận chuyến', tabBarIcon: tabIcon('speedometer') }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Thu nhập', tabBarIcon: tabIcon('wallet') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Tài khoản', tabBarIcon: tabIcon('person-circle') }}
      />
    </Tabs>
  );
}
