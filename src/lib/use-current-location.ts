import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { DEFAULT_CENTER, type LngLat } from './geo';

/**
 * Asks for location permission once and returns the device position.
 * Falls back to DEFAULT_CENTER when permission is denied or GPS fails
 * (e.g. on an emulator with no location set).
 */
export function useCurrentLocation() {
  const [coord, setCoord] = useState<LngLat>(DEFAULT_CENTER);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        setGranted(true);
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) setCoord([last.coords.longitude, last.coords.latitude]);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setCoord([pos.coords.longitude, pos.coords.latitude]);
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { coord, granted };
}
