import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { DEFAULT_CENTER, type LngLat } from './geo';

type Options = {
  /** Keep tracking the device (watchPositionAsync) instead of reading it once. */
  watch?: boolean;
};

/**
 * Device position. `coord` falls back to DEFAULT_CENTER until a real fix exists;
 * check `hasFix` before using it for anything that matters (booking, going online).
 */
export function useCurrentLocation({ watch = false }: Options = {}) {
  const [coord, setCoord] = useState<LngLat>(DEFAULT_CENTER);
  const [heading, setHeading] = useState<number | null>(null);
  const [hasFix, setHasFix] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    const apply = (pos: Location.LocationObject) => {
      if (cancelled) return;
      setCoord([pos.coords.longitude, pos.coords.latitude]);
      const h = pos.coords.heading;
      setHeading(typeof h === 'number' && h >= 0 ? h : null);
      setHasFix(true);
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setGranted(status === 'granted');
        if (status !== 'granted') return;
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) apply(last);
        if (watch) {
          const s = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
            apply
          );
          if (cancelled) s.remove();
          else sub = s;
        } else {
          apply(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        }
      } catch {
        // Keep the fallback; hasFix stays false.
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watch]);

  return { coord, heading, hasFix, granted };
}
