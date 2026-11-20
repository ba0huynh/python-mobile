import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import mapStyle from '@/constants/map-style.json';
import { Colors } from '@/constants/theme';
import { type LngLat } from '@/lib/geo';

export type { CameraRef };

type AppMapProps = {
  initialCenter: LngLat;
  cameraRef?: Ref<CameraRef>;
  onPress?: (coord: LngLat) => void;
  onLongPress?: (coord: LngLat) => void;
  children?: ReactNode;
};

/** Full-screen MapLibre map using the OpenFreeMap style from map.json. */
export function AppMap({ initialCenter, cameraRef, onPress, onLongPress, children }: AppMapProps) {
  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle as unknown as StyleSpecification}
      logo={false}
      compass={false}
      onPress={onPress ? (e) => onPress(e.nativeEvent.lngLat) : undefined}
      onLongPress={onLongPress ? (e) => onLongPress(e.nativeEvent.lngLat) : undefined}>
      <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: 15 }} />
      {children}
    </Map>
  );
}

type PinKind = 'pickup' | 'dropoff' | 'driver';

const PIN: Record<PinKind, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pickup: { color: Colors.primary, icon: 'person' },
  dropoff: { color: Colors.danger, icon: 'flag' },
  driver: { color: Colors.driver, icon: 'bicycle' },
};

export function MapPin({ id, coord, kind }: { id: string; coord: LngLat; kind: PinKind }) {
  const { color, icon } = PIN[kind];
  return (
    <Marker id={id} lngLat={coord} anchor="bottom">
      <View style={styles.pinWrap}>
        <View style={[styles.pin, { backgroundColor: color }]}>
          <Ionicons name={icon} size={16} color="#fff" />
        </View>
        <View style={[styles.pinTail, { borderTopColor: color }]} />
      </View>
    </Marker>
  );
}

export type RouteLineProps = {
  /** Unique per map: two lines with the same id would collide. */
  id?: string;
  from?: LngLat;
  to?: LngLat;
  coordinates?: LngLat[];
  geometry?:
    | { type: string; coordinates: number[][] | [number, number][] }
    | GeoJSON.LineString;
  color?: string;
};

/** Road route between points (GeoJSON LineString) or straight line fallback. */
export function RouteLine({ id = 'route', from, to, coordinates, geometry, color = Colors.primary }: RouteLineProps) {
  const coords = (geometry?.coordinates as LngLat[]) ?? coordinates ?? (from && to ? [from, to] : []);
  const isRealRoute = Boolean(geometry || (coordinates && coordinates.length > 2));

  const feature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };

  return (
    <GeoJSONSource id={id} data={feature}>
      <Layer
        id={`${id}-line`}
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': color,
          'line-width': 5,
          'line-opacity': 0.85,
          ...(isRealRoute ? {} : { 'line-dasharray': [1, 1.5] }),
        }}
      />
    </GeoJSONSource>
  );
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center' },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});
