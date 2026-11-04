import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useRole } from '@/lib/role';

/**
 * App entrypoint:
 * - If authenticated as customer/driver with matching role -> go to main app.
 * - Otherwise -> show the Login screen first.
 */
export default function IndexScreen() {
  const { role } = useRole();
  const { customer, driver, customerToken, driverToken, ready: authReady } = useAuth();
  const { ready: roleReady } = useRole();

  if (!authReady || !roleReady) return null;

  // Has valid customer token and role is customer
  if (role === 'customer' && customer && customerToken) {
    return <Redirect href="/customer" />;
  }

  // Has valid driver token and role is driver
  if (role === 'driver' && driver && driverToken) {
    return <Redirect href="/driver" />;
  }

  // Fallback if only customer token exists
  if (customer && customerToken && (!driver || !driverToken)) {
    return <Redirect href="/customer" />;
  }

  // Fallback if only driver token exists
  if (driver && driverToken && (!customer || !customerToken)) {
    return <Redirect href="/driver" />;
  }

  // When no auth token -> directly show the login screen first
  return (
    <Redirect
      href={role === 'driver' ? '/auth/login?role=driver' : '/auth/login?role=customer'}
    />
  );
}
