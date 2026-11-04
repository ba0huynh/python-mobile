import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ReactNode, Ref } from 'react';
import React, { createContext, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import mapStyle from '@/constants/map-style.json';
import { Colors } from '@/constants/theme';
import { type LngLat } from '@/lib/geo';

// Configure the worker URL explicitly so Metro bundler does not try to load a relative worker URL that 404s
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist/maplibre-gl-worker.mjs');
}

export type CameraRef = {
  flyTo: (options: { center: LngLat; zoom?: number; duration?: number }) => void;
  fitBounds: (
    bounds: [number, number, number, number],
    options?: { padding?: { top?: number; bottom?: number; left?: number; right?: number }; duration?: number }
  ) => void;
};

const MapContext = createContext<maplibregl.Map | null>(null);

type AppMapProps = {
  initialCenter: LngLat;
  cameraRef?: Ref<CameraRef>;
  onLongPress?: (coord: LngLat) => void;
  children?: ReactNode;
};

/** Full-screen MapLibre map on Web using MapLibre GL JS and OpenFreeMap style. */
export function AppMap({ initialCenter, cameraRef, onLongPress, children }: AppMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [activeMap, setActiveMap] = useState<maplibregl.Map | null>(null);
  const onLongPressRef = useRef(onLongPress);

  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  useImperativeHandle(cameraRef, () => ({
    flyTo: (options) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: options.center,
        zoom: options.zoom ?? 15,
        duration: options.duration ?? 800,
      });
    },
    fitBounds: (bounds, options) => {
      const map = mapRef.current;
      if (!map) return;
      const padding = options?.padding
        ? {
            top: options.padding.top ?? 0,
            bottom: options.padding.bottom ?? 0,
            left: options.padding.left ?? 0,
            right: options.padding.right ?? 0,
          }
        : undefined;

      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        {
          padding,
          duration: options?.duration ?? 800,
        }
      );
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle as unknown as maplibregl.StyleSpecification,
      center: initialCenter,
      zoom: 15,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      setActiveMap(map);
      map.resize();
    });

    // Support right-click / contextmenu as instant coordinate selection
    map.on('contextmenu', (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      onLongPressRef.current?.([e.lngLat.lng, e.lngLat.lat]);
    });

    // Support long press on desktop/touch (holding mouse/touch for 500ms)
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const startHold = (lng: number, lat: number) => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        onLongPressRef.current?.([lng, lat]);
        holdTimer = null;
      }, 500);
    };
    const cancelHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    map.on('mousedown', (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button === 0) startHold(e.lngLat.lng, e.lngLat.lat);
    });
    map.on('mouseup', cancelHold);
    map.on('dragstart', cancelHold);
    map.on('touchstart', (e: maplibregl.MapTouchEvent) => {
      if (e.lngLat) startHold(e.lngLat.lng, e.lngLat.lat);
    });
    map.on('touchend', cancelHold);
    map.on('touchcancel', cancelHold);

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelHold();
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      setActiveMap(null);
    };
    // initialCenter is only for mounting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', left: 0, top: 0 }} />
      {activeMap && <MapContext.Provider value={activeMap}>{children}</MapContext.Provider>}
    </View>
  );
}

type PinKind = 'pickup' | 'dropoff' | 'driver';

const PIN_ICONS: Record<PinKind, { color: string; svg: string }> = {
  pickup: {
    color: Colors.primary,
    svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  },
  dropoff: {
    color: Colors.danger,
    svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>',
  },
  driver: {
    color: Colors.driver,
    svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm7-10l-1.9-3.2c-.4-.6-1-1-1.7-1H5v2h3.1l1.4 2.3-3.8 6.5 1.7 1 3.5-6h3.6l1.8 3h-2.3v2h4.5l-2.6-4.5 1.8-3.1c.6.9 1.6 1.6 2.8 1.6v-2c-1.2 0-2.1-.8-2.5-1.6zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/></svg>',
  },
};

export function MapPin({ id: _id, coord, kind }: { id: string; coord: LngLat; kind: PinKind }) {
  const map = useContext(MapContext);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    const { color, svg } = PIN_ICONS[kind];

    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.cursor = 'pointer';

    const circle = document.createElement('div');
    circle.style.width = '34px';
    circle.style.height = '34px';
    circle.style.borderRadius = '17px';
    circle.style.backgroundColor = color;
    circle.style.border = '3px solid #ffffff';
    circle.style.boxShadow = '0 2px 4px rgba(0,0,0,0.25)';
    circle.style.display = 'flex';
    circle.style.alignItems = 'center';
    circle.style.justifyContent = 'center';
    circle.innerHTML = svg;

    const tail = document.createElement('div');
    tail.style.width = '0';
    tail.style.height = '0';
    tail.style.borderLeft = '6px solid transparent';
    tail.style.borderRight = '6px solid transparent';
    tail.style.borderTop = `8px solid ${color}`;
    tail.style.marginTop = '-1px';

    el.appendChild(circle);
    el.appendChild(tail);

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(coord).addTo(map);

    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // Recreate element if kind changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, kind]);

  useEffect(() => {
    markerRef.current?.setLngLat(coord);
  }, [coord]);

  return null;
}

export type RouteLineProps = {
  from?: LngLat;
  to?: LngLat;
  coordinates?: LngLat[];
  geometry?:
    | { type: string; coordinates: number[][] | [number, number][] }
    | GeoJSON.LineString;
  color?: string;
};

export function RouteLine({ from, to, coordinates, geometry, color = Colors.primary }: RouteLineProps) {
  const map = useContext(MapContext);
  const reactId = useId();
  const sourceId = `src-${reactId.replace(/:/g, '')}`;
  const layerId = `layer-${reactId.replace(/:/g, '')}`;

  const coords = useMemo(
    () => (geometry?.coordinates as LngLat[]) ?? coordinates ?? (from && to ? [from, to] : []),
    [geometry, coordinates, from, to]
  );
  const isRealRoute = Boolean(geometry || (coordinates && coordinates.length > 2));

  const coordsKey = useMemo(() => JSON.stringify(coords), [coords]);
  const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = useMemo(
    () => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordsKey]
  );

  useEffect(() => {
    if (!map || coords.length < 2) return;

    map.addSource(sourceId, {
      type: 'geojson',
      data: geojsonData,
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': 5,
        'line-opacity': 0.85,
        ...(isRealRoute ? {} : { 'line-dasharray': [1, 1.5] }),
      },
    });

    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Ignore during cleanup
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sourceId, layerId]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source && coords.length >= 2) {
      source.setData(geojsonData);
    }
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-color', color);
    }
  }, [map, geojsonData, coords.length, color, sourceId, layerId]);

  return null;
}
