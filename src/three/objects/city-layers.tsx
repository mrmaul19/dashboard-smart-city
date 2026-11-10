'use client';

import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { BufferGeometry } from 'three';
import type { LoadedTile } from '@/features/city/hooks/use-city-data';
import type { SnapshotBuilding } from '@/features/city/types/city-data';
import {
  buildBuildingsGeometry,
  buildGreenGeometry,
  buildRoadsGeometry,
  buildSelectionGeometry,
  pickFeature,
  type MergedGeometry,
} from '@/three/utils/city-geometry';

/**
 * City geometry layers.
 *
 * One merged mesh per tile per layer, so the whole city is a few dozen draw
 * calls rather than one per building. Geometry is built in `useMemo` keyed on
 * the tile, and explicitly disposed on unmount: geometry passed to a mesh as a
 * prop is not owned by React Three Fiber, so nothing else would free the GPU
 * buffers when a tile unloads.
 */

/** Free GPU buffers for a geometry this component created. */
function useDisposeGeometry(geometry: BufferGeometry | null): void {
  useEffect(() => {
    if (!geometry) return;
    return () => geometry.dispose();
  }, [geometry]);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

interface BuildingTileProps {
  tile: LoadedTile;
  onSelect: (building: SnapshotBuilding) => void;
  castShadow: boolean;
}

function BuildingTile({ tile, onSelect, castShadow }: BuildingTileProps) {
  const merged: MergedGeometry = useMemo(
    () => buildBuildingsGeometry(tile.buildings),
    [tile],
  );
  useDisposeGeometry(merged.geometry);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    // Without this the click also reaches the ground plane behind the city,
    // which would immediately clear the selection that was just made.
    event.stopPropagation();

    const index = pickFeature(merged, event.faceIndex);
    if (index === null) return;

    const building = tile.buildings[index];
    if (building) onSelect(building);
  };

  return (
    <mesh
      geometry={merged.geometry}
      castShadow={castShadow}
      receiveShadow
      onClick={handleClick}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      {/*
        Lambert rather than a physically based material: the city is a backdrop
        for data overlays, and Lambert shades a merged mesh of ~90,000 flat
        triangles at a fraction of the fragment cost. Vertex colours carry the
        building category.
      */}
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

export function BuildingsLayer({
  tiles,
  onSelect,
  shadows,
  distanceByKey,
}: {
  tiles: readonly LoadedTile[];
  onSelect: (building: SnapshotBuilding) => void;
  shadows: boolean;
  /** Distance from the load focus per tile key, for distance-based detail. */
  distanceByKey: ReadonlyMap<string, number>;
}) {
  return (
    <group name="buildings">
      {tiles.map((tile) => (
        <BuildingTile
          key={tile.key}
          tile={tile}
          onSelect={onSelect}
          // Shadow casting is limited to tiles near the camera target: a
          // shadow map covering the entire study area at a useful resolution
          // is far more expensive than the visual gain at city scale.
          castShadow={shadows && (distanceByKey.get(tile.key) ?? 0) < 700}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

function RoadTile({ tile }: { tile: LoadedTile }) {
  const merged = useMemo(() => buildRoadsGeometry(tile.roads), [tile]);
  useDisposeGeometry(merged.geometry);

  return (
    <mesh geometry={merged.geometry} receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

export function RoadsLayer({ tiles }: { tiles: readonly LoadedTile[] }) {
  return (
    <group name="roads">
      {tiles.map((tile) => (
        <RoadTile key={tile.key} tile={tile} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Green and water
// ---------------------------------------------------------------------------

function GreenTile({ tile }: { tile: LoadedTile }) {
  const merged = useMemo(() => buildGreenGeometry(tile.green), [tile]);
  useDisposeGeometry(merged.geometry);

  return (
    <mesh geometry={merged.geometry} receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

export function GreenLayer({ tiles }: { tiles: readonly LoadedTile[] }) {
  return (
    <group name="green">
      {tiles.map((tile) => (
        <GreenTile key={tile.key} tile={tile} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Selection highlight
// ---------------------------------------------------------------------------

/**
 * Outline for the selected building.
 *
 * A slightly inflated copy of the one footprint, drawn over the merged mesh.
 * Rebuilding a single extrusion is cheaper and simpler than rewriting a vertex
 * colour range inside a merged buffer every time the selection changes.
 */
export function SelectionHighlight({
  building,
}: {
  building: SnapshotBuilding | null;
}) {
  const geometry = useMemo(
    () => (building ? buildSelectionGeometry(building) : null),
    [building],
  );
  useDisposeGeometry(geometry);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial
        color="#22d3ee"
        transparent
        opacity={0.28}
        depthWrite={false}
      />
    </mesh>
  );
}
