'use client';

import { useMemo } from 'react';
import { DEFAULT_CITY } from '@/lib/constants/city-config';
import { geoToLocal } from '@/lib/geo/projection';

/**
 * Air-quality markers in the 3D scene.
 *
 * Deliberately **not** a heatmap. Spec §7 forbids inventing a geographic
 * pollution distribution from sparse measurements, and OpenAQ typically gives
 * one usable station for a city, so interpolating a surface would be fabricated
 * data wearing the costume of a measurement. Each station is drawn only at its
 * own position.
 *
 * Stations are placed by projecting their real coordinates into the scene. The
 * search radius is 25 km while the rendered city is 1.5 km across, so most
 * stations fall far outside the visible area; anything beyond the camera's
 * reach is omitted here and listed in the air-quality panel with its distance
 * instead of being dragged into view, which would misrepresent where it is.
 */

/** Stations beyond this distance from the origin are not drawn. */
const RENDER_LIMIT_M = 2_400;

export interface AirQualityMarker {
  readonly id: number;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** Measured concentration driving the column height, if known. */
  readonly pm25: number | null;
  /** AQI category colour, or null when no AQI could be computed. */
  readonly colour: string | null;
  readonly isPrimary: boolean;
}

interface AirQualityOverlayProps {
  markers: readonly AirQualityMarker[];
}

export function AirQualityOverlay({ markers }: AirQualityOverlayProps) {
  const placed = useMemo(() => {
    return markers
      .map((marker) => {
        const { x, z } = geoToLocal(
          marker.lat,
          marker.lon,
          DEFAULT_CITY.center,
        );
        return { ...marker, x, z };
      })
      .filter(
        (marker) =>
          Math.abs(marker.x) <= RENDER_LIMIT_M &&
          Math.abs(marker.z) <= RENDER_LIMIT_M,
      );
  }, [markers]);

  if (placed.length === 0) return null;

  return (
    <group name="air-quality">
      {placed.map((marker) => {
        // Column height reads the concentration directly. Capped at 60 µg/m³
        // so an extreme reading cannot produce a column that dwarfs the city.
        const height =
          marker.pm25 === null
            ? 60
            : 40 + Math.min(marker.pm25, 60) * 4;
        const colour = marker.colour ?? '#94a3b8';

        return (
          <group key={marker.id} position={[marker.x, 0, marker.z]}>
            {/* Vertical column: translucent so it never hides the city. */}
            <mesh position={[0, height / 2, 0]}>
              <cylinderGeometry args={[6, 6, height, 12, 1, true]} />
              <meshBasicMaterial
                color={colour}
                transparent
                opacity={marker.pm25 === null ? 0.16 : 0.34}
                depthWrite={false}
              />
            </mesh>

            {/*
              Ground ring marks the station's exact position. It is not a
              coverage or influence radius — the reading applies to the sensor,
              not to the area inside the ring.
            */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
              <ringGeometry args={[14, 18, 32]} />
              <meshBasicMaterial
                color={colour}
                transparent
                opacity={0.55}
                depthWrite={false}
              />
            </mesh>

            {marker.isPrimary ? (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
                <ringGeometry args={[22, 24, 32]} />
                <meshBasicMaterial
                  color="#67e8f9"
                  transparent
                  opacity={0.5}
                  depthWrite={false}
                />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
