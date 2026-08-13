// Star-tetrahedron (stella octangula) geometry: two regular tetrahedra
// interlocked at 180°, expressed as the 24 outward spike triangles (one
// spike per cube corner over the shared central octahedron, three lateral
// faces each). Backface culling + centroid depth sort stays exact because
// those spikes never cross, unlike the 8 big tetrahedron faces which
// interpenetrate.

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Apex corners (±1,±1,±1)/√3 sit on the unit sphere; the central octahedron
// vertices (±1,0,0)/√3, (0,±1,0)/√3, (0,0,±1)/√3 are where the twin
// tetrahedra's edges cross.
const CORNER = 1 / Math.sqrt(3);

export function buildStarTetrahedron() {
  const tris = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tetra = sx * sy * sz > 0 ? 0 : 1;
        const apex = [sx * CORNER, sy * CORNER, sz * CORNER];
        const bx = [sx * CORNER, 0, 0];
        const by = [0, sy * CORNER, 0];
        const bz = [0, 0, sz * CORNER];
        for (const [b, c] of [[bx, by], [by, bz], [bz, bx]]) {
          const n = cross(sub(b, apex), sub(c, apex));
          const centroid = [
            (apex[0] + b[0] + c[0]) / 3,
            (apex[1] + b[1] + c[1]) / 3,
            (apex[2] + b[2] + c[2]) / 3,
          ];
          // The solid is star-shaped around the origin, so "outward" is
          // simply "away from the centre"; flip the winding when needed.
          tris.push(dot(n, centroid) >= 0 ? { v: [apex, b, c], tetra } : { v: [apex, c, b], tetra });
        }
      }
    }
  }
  return tris;
}

/** Ry→Rx→Rz tumble rotation, returned as a per-vertex mapper. */
export function makeRotation(ax, ay, az) {
  const sx = Math.sin(ax), cx = Math.cos(ax);
  const sy = Math.sin(ay), cy = Math.cos(ay);
  const sz = Math.sin(az), cz = Math.cos(az);
  return ([x0, y0, z0]) => {
    const x1 = x0 * cy + z0 * sy;
    const z1 = -x0 * sy + z0 * cy;
    const y2 = y0 * cx - z1 * sx;
    const z2 = y0 * sx + z1 * cx;
    return [x1 * cz - y2 * sz, x1 * sz + y2 * cz, z2];
  };
}
