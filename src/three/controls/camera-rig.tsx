'use client';

import { useEffect, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import type CameraControlsImpl from 'camera-controls';

/**
 * Camera controls for the city (spec §4): orbit, zoom, pan, smooth transitions,
 * reset, and focus on a selected building.
 *
 * Implemented with drei's `CameraControls` rather than `OrbitControls` plus a
 * GSAP tween. `camera-controls` owns the camera's transform and interpolates
 * internally with `setLookAt(…, true)`, so an external tween writing to the
 * same transform would fight it and produce stutter. Its built-in easing is
 * the correct tool here; GSAP is kept for animation that does not contend with
 * a controller.
 */

/** Default viewpoint: an oblique view from the south-east, framing the area. */
const DEFAULT_POSITION: readonly [number, number, number] = [620, 430, 620];
const DEFAULT_TARGET: readonly [number, number, number] = [0, 0, 0];

/** Camera travel limit, in metres, a little beyond the study area. */
const BOUNDARY_M = 1_600;

interface CameraRigProps {
  /** Changes to this value request a return to the default viewpoint. */
  resetNonce: number;
  /** Scene point to fly to, in local metres. */
  focusTarget: readonly [number, number, number] | null;
}

export function CameraRig({ resetNonce, focusTarget }: CameraRigProps) {
  const controlsRef = useRef<CameraControlsImpl | null>(null);

  // Initial placement, and a hard limit so the camera cannot be panned off
  // into empty space far from any geometry.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.setLookAt(
      DEFAULT_POSITION[0], DEFAULT_POSITION[1], DEFAULT_POSITION[2],
      DEFAULT_TARGET[0], DEFAULT_TARGET[1], DEFAULT_TARGET[2],
      false,
    );
    controls.setBoundary(
      new Box3(
        new Vector3(-BOUNDARY_M, 0, -BOUNDARY_M),
        new Vector3(BOUNDARY_M, BOUNDARY_M, BOUNDARY_M),
      ),
    );
  }, []);

  // Reset. Skipped on first render, when the nonce is still 0.
  useEffect(() => {
    if (resetNonce === 0) return;
    controlsRef.current?.setLookAt(
      DEFAULT_POSITION[0], DEFAULT_POSITION[1], DEFAULT_POSITION[2],
      DEFAULT_TARGET[0], DEFAULT_TARGET[1], DEFAULT_TARGET[2],
      true,
    );
  }, [resetNonce]);

  // Focus on a feature: approach from the south-east at a distance scaled to
  // the feature's height, so a tower is framed from further back than a shed.
  useEffect(() => {
    if (!focusTarget) return;
    const [x, y, z] = focusTarget;
    const standoff = Math.max(70, y * 3.2);

    controlsRef.current?.setLookAt(
      x + standoff, y + standoff * 0.75, z + standoff,
      x, y * 0.5, z,
      true,
    );
  }, [focusTarget]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={25}
      maxDistance={2_200}
      // Stop just short of the horizon so the camera never dips below ground.
      maxPolarAngle={Math.PI / 2 - 0.05}
      smoothTime={0.28}
      draggingSmoothTime={0.12}
      dollyToCursor
      truckSpeed={2.4}
    />
  );
}
