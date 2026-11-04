import { Redirect, Tabs } from 'expo-router';

import { tabIcon } from '@/components/tab-icon';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function CustomerTabs() {
  const { customer, customerToken, ready } = useAuth();

  if (ready && (!customer || !customerToken)) {
    return <Redirect href="/auth/login?role=customer" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: Colors.primary }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Đặt xe', tabBarIcon: tabIcon('navigate') }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: 'Chuyến đi', tabBarIcon: tabIcon('time') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Tài khoản', tabBarIcon: tabIcon('person-circle') }}
      />
    </Tabs>
  );
}
