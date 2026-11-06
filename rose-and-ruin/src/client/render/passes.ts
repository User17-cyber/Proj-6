// Which pass is being rendered, so objects can draw cheaper versions of themselves in
// reflections and shadows.

import type * as THREE from 'three';

export const PASS = {
  /** true while the planar reflection is rendered */
  reflect: false,
  /** shadow cameras of the cascades that knights cast into (the near ones) */
  knightShadowCams: new Set<THREE.Camera>(),
};
