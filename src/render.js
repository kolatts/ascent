// One WebGL canvas behind the whole interface. A screen hands over a scene, a
// camera and the element it should be drawn inside; the loop scissors the
// canvas to that element's rectangle. Every shape here is built from
// primitives — there is nothing to download.

import * as THREE from 'three';
import { PARTS, GRID_W, GRID_H } from './parts.js';
import { prefersReducedMotion } from './util.js';

export const CELL = 1;

let renderer, clock, current = null, raf = 0;
let canvasEl = null;

export function initRenderer(canvas) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  clock = new THREE.Clock();
  resize();
  window.addEventListener('resize', resize);
  loop();
  return renderer;
}

function resize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** view = { scene, camera, anchor, update(dt, t), dispose() } */
export function setView(view) {
  if (current?.dispose) current.dispose();
  current = view;
}

export function clearView() {
  if (current?.dispose) current.dispose();
  current = null;
  if (!renderer) return;
  // Reset to the whole canvas first, or the clear only wipes the last
  // screen's rectangle and its final frame is left hanging there.
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
  renderer.clear();
}

export const getRenderer = () => renderer;

/** Screen-space rect of the current view's anchor, in CSS pixels. */
export function viewRect() {
  if (!current) return null;
  if (!current.anchor) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const r = current.anchor.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!current || !renderer) return;
  const rect = viewRect();
  if (!rect) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  current.update?.(dt, clock.elapsedTime);

  const { camera, scene } = current;
  if (camera.isPerspectiveCamera && camera.aspect !== rect.width / rect.height) {
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  const y = window.innerHeight - rect.top - rect.height;
  renderer.setViewport(rect.left, y, rect.width, rect.height);
  renderer.setScissor(rect.left, y, rect.width, rect.height);
  renderer.clear();
  renderer.render(scene, camera);
}

/** Pointer position in normalised device coords for the current view. */
export function ndcFromEvent(ev) {
  const rect = viewRect();
  if (!rect) return null;
  return new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1
  );
}

// ------------------------------------------------------------- ingredients --

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color, size = 3, opacity = 0.75) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

export function starfield(count = 900, radius = 260, seedColor = 0xffffff) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const base = new THREE.Color(seedColor);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.55 + Math.random() * 0.45);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const tint = base.clone().offsetHSL((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.6) * 0.35);
    col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.5, sizeAttenuation: true, vertexColors: true,
    map: glowTexture(), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

export function skyLights(scene, warm = 0xffdd91, cool = 0x3b4a8c) {
  scene.add(new THREE.HemisphereLight(warm, cool, 1.0));
  const key = new THREE.DirectionalLight(0xfff3c4, 1.5);
  key.position.set(6, 9, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 0.6);
  rim.position.set(-7, 3, -6);
  scene.add(rim);
}

// Everything on the ship is glossy moulded plastic in a bright colour: think
// a good toy rocket, not an antique. Clearcoat gives the highlight that reads
// as "new" rather than "salvaged".
const matCache = new Map();
function partMaterial(hue, state) {
  const k = `${hue}:${state}`;
  if (matCache.has(k)) return matCache.get(k);
  let m;
  if (state === 'dark') {
    m = new THREE.MeshPhysicalMaterial({
      color: 0x6a7290, roughness: 0.75, metalness: 0, clearcoat: 0.3,
    });
  } else if (state === 'broken') {
    m = new THREE.MeshPhysicalMaterial({
      color: 0x7d5a68, roughness: 0.85, metalness: 0,
      emissive: 0x7a2b2b, emissiveIntensity: 0.4,
    });
  } else {
    m = new THREE.MeshPhysicalMaterial({
      color: hue, roughness: 0.22, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.12,
      emissive: new THREE.Color(hue).multiplyScalar(0.22),
    });
  }
  matCache.set(k, m);
  return m;
}

const TRIM = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.15, metalness: 0, clearcoat: 1,
  emissive: 0x556080, emissiveIntensity: 0.25,
});
const CREAM = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.25, metalness: 0, side: THREE.DoubleSide,
  clearcoat: 1, emissive: 0x9fd0ff, emissiveIntensity: 0.35,
});
const RAFT = new THREE.MeshPhysicalMaterial({
  color: 0xf3f6ff, roughness: 0.3, metalness: 0, clearcoat: 1,
  emissive: 0x3a4a7a, emissiveIntensity: 0.18,
});
const RAFT_BROKEN = new THREE.MeshPhysicalMaterial({
  color: 0x6b5a68, roughness: 0.9, metalness: 0,
});

// ------------------------------------------------------------------- ships --

/** Grid cell -> local ship coordinates. Row 0 is the nose (-Z), row 5 the rear (+Z). */
export function cellToLocal(x, y, w = 1, h = 1) {
  return {
    x: (x + w / 2 - GRID_W / 2) * CELL,
    z: (y + h / 2 - GRID_H / 2) * CELL,
  };
}

function buildPartMesh(type, state) {
  const def = PARTS[type];
  const g = new THREE.Group();
  const mat = partMaterial(def.hue, state);
  const lit = state === 'lit';

  const W = def.w * CELL * 0.9;
  const D = def.h * CELL * 0.9;

  switch (type) {
    case 'hull': {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(W, 0.26, D), mat);
      g.add(plate);
      const rivet = new THREE.SphereGeometry(0.055, 6, 5);
      for (const [rx, rz] of [[-0.3, -0.3], [0.3, 0.3]]) {
        const r = new THREE.Mesh(rivet, TRIM);
        r.position.set(rx, 0.15, rz);
        g.add(r);
      }
      break;
    }
    case 'reactor': {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(W * 0.42, W * 0.48, 0.44, 16), mat));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(W * 0.44, 0.07, 8, 24), TRIM);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.24;
      g.add(ring);
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.3, 1),
        new THREE.MeshBasicMaterial({ color: lit ? 0xffc07a : 0x50505f })
      );
      core.position.y = 0.34;
      g.add(core);
      if (lit) {
        const halo = glowSprite(0xff9a5a, 2.6, 0.55);
        halo.position.y = 0.4;
        g.add(halo);
      }
      break;
    }
    case 'thruster': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.34, D * 0.6), mat));
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.19, 0.55, 12, 1, true), TRIM);
      bell.rotation.x = Math.PI / 2;
      bell.position.z = D * 0.42;
      g.add(bell);
      if (lit) {
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 1.5, 12, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x7fe4ff, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          })
        );
        plume.rotation.x = -Math.PI / 2;
        plume.position.z = D * 0.42 + 0.75;
        plume.name = 'plume';
        g.add(plume);
        const spark = glowSprite(0x7fe4ff, 1.5, 0.8);
        spark.position.z = D * 0.42 + 0.2;
        g.add(spark);
      }
      break;
    }
    case 'tank': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(W * 0.34, D * 0.5, 6, 14), mat);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.1;
      g.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(W * 0.35, 0.05, 8, 20), TRIM);
      band.position.y = 0.1;
      band.rotation.y = Math.PI / 2;
      g.add(band);
      break;
    }
    case 'cargo': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.42, D), mat));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.1, D * 0.24), TRIM);
      lid.position.y = 0.25;
      g.add(lid);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), TRIM);
      latch.position.set(0, 0.3, D * 0.35);
      g.add(latch);
      break;
    }
    case 'scanner': {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 8), TRIM);
      mast.position.y = 0.2;
      g.add(mast);
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 14, 1, true), mat);
      dish.position.y = 0.5;
      dish.rotation.x = Math.PI;
      g.add(dish);
      if (lit) {
        const p = glowSprite(0xb9bee0, 1.2, 0.6);
        p.position.y = 0.6;
        g.add(p);
      }
      break;
    }
    case 'quarters': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), mat));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.position.y = 0.14;
      g.add(dome);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 16), TRIM);
      ring.position.set(W * 0.3, 0.16, 0);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      if (lit) {
        const warm = glowSprite(0xffdd91, 1.1, 0.5);
        warm.position.set(W * 0.3, 0.16, 0);
        g.add(warm);
      }
      break;
    }
    case 'repair': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), mat));
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), TRIM);
      arm.position.set(-W * 0.2, 0.32, 0);
      arm.rotation.z = 0.5;
      g.add(arm);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), TRIM);
      joint.position.set(-W * 0.36, 0.58, 0);
      g.add(joint);
      break;
    }
    case 'bumper': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 10, 20), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      g.add(ring);
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), TRIM);
      nub.position.y = 0.14;
      g.add(nub);
      if (lit) {
        const p = glowSprite(0xffe24d, 1.6, 0.6);
        p.position.y = 0.2;
        g.add(p);
      }
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), mat));
  }
  return g;
}

/**
 * A smooth swept wing with real thickness, extruded so it still catches the
 * light when the camera looks straight along it.
 */
function wingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.quadraticCurveTo(1.9, -1.15, 3.1, -0.15);
  s.quadraticCurveTo(3.5, 0.15, 3.05, 0.42);
  s.quadraticCurveTo(1.7, 0.95, 0, 1.0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.06, bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);   // lay it flat in the XZ plane
  geo.translate(0, 0.08, 0);
  return geo;
}
let wingGeo = null;

function buildWing(side, edgeX) {
  wingGeo = wingGeo || wingGeometry();
  const wing = new THREE.Mesh(wingGeo, CREAM);
  wing.scale.set(side, 1, 1.15);

  const tip = glowSprite(0x7fe4ff, 2.2, 0.55);
  tip.position.set(side * 3.1, 0.15, 0.2);

  const pivot = new THREE.Group();
  pivot.add(wing, tip);
  pivot.rotation.z = side * 0.3;   // tips ride a little above the hull
  pivot.position.set(edgeX, 0.34, 0.1);
  return pivot;
}

/**
 * The ship, exactly as laid out on the grid.
 * `power` comes from powerAnalysis; parts with no power turn grey.
 */
export function buildShip(placements, power, { wings = true } = {}) {
  const outer = new THREE.Group();
  const group = new THREE.Group();
  outer.add(group);
  const plumes = [];
  let minX = 99, maxX = -99;

  for (const p of placements) {
    const def = PARTS[p.type];
    const state = p.damaged ? 'broken' : power?.powered?.has(p.uid) ? 'lit' : 'dark';

    // A thin brass raft under every occupied cell. It is what turns a set of
    // separate boxes into one silhouette, and it is drawn straight from the
    // grid, so the hull really is the shape the player laid out.
    const raft = new THREE.Mesh(
      new THREE.BoxGeometry(def.w * CELL, 0.14, def.h * CELL),
      state === 'broken' ? RAFT_BROKEN : RAFT
    );
    const rp = cellToLocal(p.x, p.y, def.w, def.h);
    raft.position.set(rp.x, -0.19, rp.z);
    group.add(raft);

    const mesh = buildPartMesh(p.type, state);
    const { x, z } = cellToLocal(p.x, p.y, def.w, def.h);
    mesh.position.set(x, 0, z);
    mesh.userData.uid = p.uid;
    group.add(mesh);
    const pl = mesh.getObjectByName('plume');
    if (pl) plumes.push(pl);
    minX = Math.min(minX, x - (def.w * CELL) / 2);
    maxX = Math.max(maxX, x + (def.w * CELL) / 2);
  }

  if (wings && placements.length) {
    // Hung off the real edges of the layout, not off an assumed centre.
    group.add(buildWing(1, maxX - 0.15));
    group.add(buildWing(-1, minX + 0.15));
  }

  // Sit the finished ship on its own centre so it spins about itself.
  if (placements.length) {
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.position.set(-c.x, 0, -c.z);
  }

  outer.userData.plumes = plumes;
  outer.userData.parts = group; // the pieces themselves, for the arrival scene
  return outer;
}

/** A slowly turning ship on a quiet star field, for the designer pane. */
export function makeShipView(anchor) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 800);
  camera.position.set(0.4, 8.6, 11.4);
  camera.lookAt(0, 0.2, 0);
  skyLights(scene);
  scene.add(starfield(500, 170));

  const halo = glowSprite(0x5b6bb5, 22, 0.28);
  halo.position.set(0, -1.4, 0);
  scene.add(halo);

  const holder = new THREE.Group();
  scene.add(holder);

  let ship = null;
  const reduced = prefersReducedMotion();

  const view = {
    scene, camera, anchor,
    setShip(placements, power) {
      if (ship) holder.remove(ship);
      ship = buildShip(placements, power);
      holder.add(ship);
    },
    update(dt, t) {
      if (!reduced) holder.rotation.y += dt * 0.22;
      if (ship) {
        holder.position.y = reduced ? 0 : Math.sin(t * 0.8) * 0.12;
        for (const p of ship.userData.plumes || []) {
          const k = 0.8 + Math.sin(t * 9 + p.position.x * 3) * 0.22;
          p.scale.set(1, k, 1);
          p.material.opacity = 0.45 + k * 0.25;
        }
      }
    },
  };
  return view;
}

// ------------------------------------------------------------------ pilots --

export const SUIT_COLORS = [0xfbf3df, 0xffc9a3, 0xb9bee0, 0x8fd9a8, 0xe9a6c4, 0xc79a4b];

export function buildPilot(pilot) {
  const g = new THREE.Group();
  const b = [0.85, 1.0, 1.18][pilot.build ?? 1];
  const suit = new THREE.MeshStandardMaterial({
    color: SUIT_COLORS[pilot.suit ?? 0], roughness: 0.72, metalness: 0.04,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdfeaff, roughness: 0.05, metalness: 0,
    transparent: true, opacity: 0.26, transmission: 0, side: THREE.DoubleSide,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf6d5b8, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x33263a, roughness: 0.7 });

  // Body: a small round pressure suit.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.44 * b, 0.34, 8, 18), suit);
  torso.position.y = 0.98;
  g.add(torso);

  // Life support on the back.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52 * b, 0.58, 0.26), suit);
  pack.position.set(0, 1.02, -0.42 * b);
  g.add(pack);
  for (const dx of [-0.14, 0.14]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.46, 10), TRIM);
    t.position.set(dx, 1.04, -0.56 * b);
    g.add(t);
  }

  // Head inside a fishbowl, so there is a face to look at.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27 * b, 18, 14), skin);
  head.position.y = 1.62;
  g.add(head);
  for (const dx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042 * b, 8, 8), dark);
    eye.position.set(dx * b, 1.66, 0.245 * b);
    g.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07 * b, 0.016, 6, 14, Math.PI), dark);
  smile.position.set(0, 1.58, 0.235 * b);
  smile.rotation.z = Math.PI;
  g.add(smile);

  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.4 * b, 22, 16), glass);
  bowl.position.y = 1.6;
  g.add(bowl);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3 * b, 0.055, 8, 22), TRIM);
  collar.position.y = 1.3;
  collar.rotation.x = Math.PI / 2;
  g.add(collar);

  const style = pilot.helmet ?? 0;
  if (style === 1) {
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.4 * b, 0.05, 8, 24, Math.PI), TRIM);
    brow.position.set(0, 1.6, 0);
    brow.rotation.set(-0.35, 0, 0);
    g.add(brow);
  } else if (style === 2) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), TRIM);
    fin.position.set(0, 2.16, 0);
    g.add(fin);
    const bulb = glowSprite(0xffdd91, 1.1, 0.8);
    bulb.position.set(0, 2.38, 0);
    g.add(bulb);
  }

  // Arms out to the sides, legs underneath.
  const limb = (x, y, len, tilt) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.115 * b, len, 6, 12), suit);
    m.position.set(x, y, 0);
    m.rotation.z = tilt;
    g.add(m);
  };
  limb(-0.48 * b, 0.98, 0.36, 0.5);
  limb(0.48 * b, 0.98, 0.36, -0.5);
  limb(-0.19 * b, 0.42, 0.4, 0.04);
  limb(0.19 * b, 0.42, 0.4, -0.04);

  for (const dx of [-1, 1]) {
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.135 * b, 12, 10), TRIM);
    glove.position.set(dx * 0.63 * b, 0.78, 0);
    g.add(glove);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22 * b, 0.14, 0.34 * b), TRIM);
    boot.position.set(dx * 0.19 * b, 0.14, 0.06);
    g.add(boot);
  }

  return g;
}

export function makePilotView(anchor) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  camera.position.set(0, 1.35, 4.6);
  camera.lookAt(0, 1.08, 0);
  skyLights(scene);
  scene.add(starfield(320, 120));

  // A soft lantern in front so the visor and face are actually readable.
  const fill = new THREE.DirectionalLight(0xfff3c4, 1.4);
  fill.position.set(1.5, 2.5, 5);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x8fa3c8, 0.7));

  const halo = glowSprite(0xffdd91, 9, 0.28);
  halo.position.set(0, 1.1, -2);
  scene.add(halo);

  const holder = new THREE.Group();
  scene.add(holder);
  let body = null;
  const reduced = prefersReducedMotion();

  return {
    scene, camera, anchor,
    setPilot(pilot) {
      if (body) holder.remove(body);
      body = buildPilot(pilot);
      holder.add(body);
    },
    update(dt, t) {
      if (!reduced) {
        holder.rotation.y = Math.sin(t * 0.5) * 0.55;
        holder.position.y = Math.sin(t * 1.1) * 0.06;
      }
    },
  };
}
