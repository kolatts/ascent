// The arcade leg. Your ship sits low on the screen and flies away from you up
// toward the next place; rocks and sparkles come down to meet it. You steer
// left and right, and that is the whole control scheme.
//
// The ship you steer is the ship you built: it is exactly as wide as its grid
// layout, so a fat cargo hauler genuinely has trouble threading a gap.

import * as THREE from 'three';
import { buildShip, glowSprite, starfield, skyLights, viewRect } from './render.js';
import { makeRng, clamp, lerp } from './util.js';

export const LANE_MAX = 9.5;    // widest the playfield ever gets
const SPAWN_Z = -78;            // where things appear, far up the screen
const DESPAWN_Z = 16;           // behind the ship
const ROCK_R = 1.75;
const SPARK_R = 1.2;

/**
 * @param anchor   element the scene is drawn inside
 * @param opts     { placements, power, stats, perks, distance, seed }
 */
export function makeFlightView(anchor, opts) {
  const { placements, power, stats, perks = [], distance = 20, seed = 1 } = opts;
  const rng = makeRng(seed);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0d1030, 0.011);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 300);
  const CAM = new THREE.Vector3(0, 13.5, 27);
  const LOOK = new THREE.Vector3(0, 0.5, -15);
  camera.position.copy(CAM);
  camera.lookAt(LOOK);
  skyLights(scene, 0xffe9b8, 0x3b4a8c);
  scene.add(new THREE.AmbientLight(0x93a6ff, 0.55));
  scene.add(starfield(1400, 150, 0xd8e2ff));

  // Something to give a sense of speed even where there is nothing to dodge.
  const streaks = makeStreaks(rng);
  scene.add(streaks.points);

  // --- the ship -------------------------------------------------------------
  const shipHolder = new THREE.Group();
  // The ship already points its nose at -Z, which is up the screen, so it
  // needs no turning — the exhaust fires back toward the viewer.
  const ship = buildShip(placements, power, { wings: true });
  shipHolder.add(ship);
  shipHolder.position.set(0, 0, 2);
  scene.add(shipHolder);

  const wake = glowSprite(0x6ee7ff, 8, 0.5);
  wake.position.set(0, -0.3, 4.4);
  shipHolder.add(wake);

  // A ship's real half-width in world units, plus a little forgiveness.
  const halfWidth = Math.max(1.1, (stats.widthCells * 0.9) / 2);
  const hitRadius = halfWidth * 0.82;

  /**
   * A tall phone shows a much narrower slice of the world than a wide screen.
   * Back the camera off, then fit the playfield to whatever is actually
   * visible, so the ship can never be steered off the side of the screen.
   */
  let laneHalf = LANE_MAX;
  function fitToViewport() {
    const rect = viewRect();
    const aspect = rect ? rect.width / rect.height : 1.6;
    const pull = clamp(1.5 / Math.max(aspect, 0.4), 1, 1.5);
    camera.position.copy(CAM).multiplyScalar(pull);
    camera.lookAt(LOOK);

    const dist = camera.position.distanceTo(new THREE.Vector3(0, 0, shipHolder.position.z));
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
    const visibleHalfW = halfH * aspect;
    // The wings stick out well past the hull cells, so leave room for them.
    laneHalf = clamp(visibleHalfW - halfWidth - 2.6, 2.4, LANE_MAX);
  }
  fitToViewport();

  // --- obstacle and pickup pools -------------------------------------------
  const rockGeo = new THREE.IcosahedronGeometry(ROCK_R, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8c7fb8, roughness: 0.85, metalness: 0.05 });
  const rockMat2 = new THREE.MeshStandardMaterial({ color: 0xa98fd6, roughness: 0.8, metalness: 0.05 });
  const sparkGeo = new THREE.IcosahedronGeometry(SPARK_R, 1);
  const sparkMat = new THREE.MeshStandardMaterial({
    color: 0xffe24d, roughness: 0.25, metalness: 0.3,
    emissive: 0xffcf2e, emissiveIntensity: 0.9,
  });

  const rocks = [];
  const sparks = [];

  // --- pacing ---------------------------------------------------------------
  // Longer hops take longer and throw more at you; that is what a long trip
  // costs now that nobody is counting fuel.
  const speed = clamp(20 + stats.speed * 26, 20, 42);
  const duration = clamp(distance / 3.2, 6.5, 15);
  const totalZ = speed * duration;

  const dodgy = perks.includes('miser');       // Careful: thinner rock fields
  const magnet = perks.includes('deeptanks');  // Magnet: sparkles come to you
  const gapNeed = Math.min(halfWidth * 2 + (dodgy ? 3.6 : 2.5), laneHalf * 1.5);

  let travelled = 0;
  let nextRockZ = 26;
  let nextSparkZ = 14;

  const result = { sparkles: 0, bumps: 0, blocked: 0, finished: false };

  let shipX = 0;
  let targetX = 0;
  let bumpCooldown = 0;
  let shieldsLeft = stats.shields;
  let shake = 0;
  const listeners = [];

  // --- steering -------------------------------------------------------------
  const pointerTo = (clientX) => {
    const rect = viewRect();
    if (!rect) return;
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    targetX = (t * 2 - 1) * laneHalf;
  };
  const onPointer = (ev) => { if (ev.clientX != null) pointerTo(ev.clientX); };
  const onKey = (ev) => {
    if (ev.key === 'ArrowLeft') targetX = clamp(targetX - 2.2, -laneHalf, laneHalf);
    if (ev.key === 'ArrowRight') targetX = clamp(targetX + 2.2, -laneHalf, laneHalf);
  };
  const bind = (el, type, fn, opt) => { el.addEventListener(type, fn, opt); listeners.push([el, type, fn]); };
  bind(anchor, 'pointermove', onPointer);
  bind(anchor, 'pointerdown', onPointer);
  bind(anchor, 'touchmove', (ev) => {
    if (ev.touches[0]) { pointerTo(ev.touches[0].clientX); ev.preventDefault(); }
  }, { passive: false });
  bind(window, 'keydown', onKey);

  // --- spawning -------------------------------------------------------------
  /**
   * A row of rocks with at least one gap the current ship can actually fit
   * through. Wide ships get a tight squeeze; they never get an impossible one.
   */
  function spawnRockRow() {
    const gapCentre = (rng() * 2 - 1) * Math.max(0, laneHalf - gapNeed * 0.5);
    const half = gapNeed / 2;
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      // Place each rock somewhere outside the gap.
      const left = rng() < 0.5;
      const span = left
        ? [-laneHalf - 2, gapCentre - half - ROCK_R]
        : [gapCentre + half + ROCK_R, laneHalf + 2];
      if (span[1] <= span[0]) continue;
      const x = lerp(span[0], span[1], rng());
      const m = new THREE.Mesh(rockGeo, rng() < 0.5 ? rockMat : rockMat2);
      m.position.set(x, (rng() - 0.5) * 1.2, SPAWN_Z - rng() * 6);
      const s = 0.7 + rng() * 0.7;
      m.scale.setScalar(s);
      m.userData.spin = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(1.4);
      m.userData.r = ROCK_R * s;
      scene.add(m);
      rocks.push(m);
    }
  }

  function spawnSpark() {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.position.set((rng() * 2 - 1) * Math.max(1, laneHalf - 1), 0.4, SPAWN_Z);
    scene.add(m);
    const halo = glowSprite(0xffe24d, 3, 0.75);
    m.add(halo);
    sparks.push(m);
  }

  const view = {
    scene, camera, anchor,
    result,
    onProgress: null,   // (0..1) -> void
    onHit: null,        // ({ shielded }) -> void
    onSparkle: null,    // (total) -> void
    onFinish: null,     // (result) -> void

    get progress() { return clamp(travelled / totalZ, 0, 1); },
    get shieldsLeft() { return shieldsLeft; },

    finishNow() {
      if (result.finished) return;
      result.finished = true;
      view.onFinish?.(result);
    },

    update(dt) {
      if (result.finished) return;
      fitToViewport();
      const step = speed * dt;
      travelled += step;

      // Ease toward wherever the pointer is; a nimble ship gets there sooner.
      shipX = lerp(shipX, targetX, clamp(dt * stats.agility, 0, 1));
      shipX = clamp(shipX, -laneHalf, laneHalf);
      shipHolder.position.x = shipX;
      shipHolder.rotation.z = clamp((targetX - shipX) * -0.09, -0.45, 0.45);
      shipHolder.rotation.y = clamp((targetX - shipX) * 0.03, -0.2, 0.2);

      if (shake > 0) {
        shake = Math.max(0, shake - dt * 4);
        shipHolder.position.y = Math.sin(shake * 60) * shake * 0.5;
      } else {
        shipHolder.position.y = 0;
      }

      streaks.update(step);

      // Spawn ahead of the ship as the world slides past.
      nextRockZ -= step;
      if (nextRockZ <= 0) {
        spawnRockRow();
        nextRockZ = (dodgy ? 30 : 22) + rng() * 16;
      }
      nextSparkZ -= step;
      if (nextSparkZ <= 0) {
        spawnSpark();
        nextSparkZ = 9 + rng() * 13;
      }

      if (bumpCooldown > 0) bumpCooldown -= dt;

      // Rocks.
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.position.z += step;
        r.rotation.x += r.userData.spin.x * dt;
        r.rotation.y += r.userData.spin.y * dt;
        if (r.position.z > DESPAWN_Z) { scene.remove(r); rocks.splice(i, 1); continue; }
        if (bumpCooldown > 0) continue;
        if (Math.abs(r.position.z - shipHolder.position.z) < r.userData.r + 1.3 &&
            Math.abs(r.position.x - shipX) < r.userData.r + hitRadius) {
          scene.remove(r);
          rocks.splice(i, 1);
          bumpCooldown = 0.7;
          shake = 0.6;
          const shielded = shieldsLeft > 0;
          if (shielded) shieldsLeft--;
          else result.bumps++;
          view.onHit?.({ shielded });
        }
      }

      // Sparkles.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.position.z += step;
        s.rotation.y += dt * 2.4;
        if (magnet && Math.abs(s.position.z - shipHolder.position.z) < 22) {
          s.position.x = lerp(s.position.x, shipX, dt * 2.4);
        }
        if (s.position.z > DESPAWN_Z) { scene.remove(s); sparks.splice(i, 1); continue; }
        if (Math.abs(s.position.z - shipHolder.position.z) < 2.2 &&
            Math.abs(s.position.x - shipX) < hitRadius + SPARK_R + 0.5) {
          scene.remove(s);
          sparks.splice(i, 1);
          result.sparkles++;
          view.onSparkle?.(result.sparkles);
        }
      }

      view.onProgress?.(view.progress);
      if (travelled >= totalZ) view.finishNow();
    },

    dispose() {
      for (const [el, type, fn] of listeners) el.removeEventListener(type, fn);
      listeners.length = 0;
    },
  };

  return view;
}

/** Cheap speed lines: a cloud of points that recycles as it flows past. */
function makeStreaks(rng) {
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rng() * 2 - 1) * 28;
    pos[i * 3 + 1] = (rng() * 2 - 1) * 12 - 3;
    pos[i * 3 + 2] = -rng() * 90;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9fb6ff, size: 0.5, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  return {
    points,
    update(step) {
      const a = geo.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let z = a.getZ(i) + step * 1.5;
        if (z > 20) z -= 110;
        a.setZ(i, z);
      }
      a.needsUpdate = true;
    },
  };
}
