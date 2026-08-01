// The star map scene. The 3D layer carries the mood — glows, threads between
// places, the light at the end. The clickable markers live in the DOM on top,
// projected from these positions, so the touch targets are big and legible.

import * as THREE from 'three';
import { NODE_TYPES } from './map.js';
import { buildShip, glowSprite, starfield, skyLights, viewRect } from './render.js';
import { prefersReducedMotion, clamp } from './util.js';

export function makeMapView(anchor, map) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0c1c, 0.0055);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
  skyLights(scene, 0xffdd91, 0x2a3a7a);
  scene.add(starfield(2200, 300, 0xc9d4ff));
  scene.add(starfield(900, 130, 0xfff3c4));

  // A few enormous, very faint clouds of gas so the void has weather in it.
  const heavenNode = map.nodes[map.heavenId];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const cloud = glowSprite(i % 2 ? 0x3b4a8c : 0x6a4e8c, 120 + i * 22, 0.14);
    cloud.position.set(
      t * heavenNode.x + (i % 3 - 1) * 22,
      -18 + (i % 3) * 16,
      -60 + ((i * 37) % 120)
    );
    scene.add(cloud);
  }

  const reduced = prefersReducedMotion();

  // --- glows per node -------------------------------------------------------
  const nodeGlows = new Map();
  const cores = new THREE.Group();
  scene.add(cores);

  for (const n of map.nodes) {
    const tint = NODE_TYPES[n.type].hue;
    const g = new THREE.Group();
    g.position.set(n.x, n.y, n.z);

    const halo = glowSprite(tint, n.type === 'heaven' ? 26 : 4.6, n.type === 'heaven' ? 0.85 : 0.7);
    g.add(halo);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(n.type === 'heaven' ? 2.4 : 0.75, n.type === 'heaven' ? 2 : 0),
      new THREE.MeshStandardMaterial({
        color: tint, roughness: 0.4, metalness: 0.3,
        emissive: tint, emissiveIntensity: 0.7,
      })
    );
    g.add(core);
    g.userData = { node: n, halo, core };
    cores.add(g);
    nodeGlows.set(n.id, g);
  }

  // Heaven gets a second, huge, soft bloom so it reads from anywhere.
  const heaven = map.nodes[map.heavenId];
  const heavenGlow = glowSprite(0xfff3c4, 70, 0.45);
  heavenGlow.position.set(heaven.x + 8, heaven.y, heaven.z);
  scene.add(heavenGlow);
  const heavenLight = new THREE.PointLight(0xfff3c4, 3, 260);
  heavenLight.position.set(heaven.x, heaven.y, heaven.z);
  scene.add(heavenLight);

  // --- threads between places ----------------------------------------------
  const linkGroup = new THREE.Group();
  scene.add(linkGroup);
  const linkLines = [];
  const done = new Set();
  for (const a of map.nodes) {
    for (const bId of a.links) {
      const pairKey = a.id < bId ? `${a.id}-${bId}` : `${bId}-${a.id}`;
      if (done.has(pairKey)) continue;
      done.add(pairKey);
      const b = map.nodes[bId];
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y, a.z),
        new THREE.Vector3(b.x, b.y, b.z),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: 0x8fa3c8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { a: a.id, b: bId };
      linkGroup.add(line);
      linkLines.push(line);
    }
  }

  // --- the ship -------------------------------------------------------------
  const shipHolder = new THREE.Group();
  shipHolder.scale.setScalar(1.05);
  scene.add(shipHolder);
  let shipMesh = null;

  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let followId = map.startId;
  let firstFrame = true;
  let drift = { x: 0, y: 0 };
  let flight = null;

  const OFFSET = new THREE.Vector3(-30, 17, 30);

  /**
   * A tall phone sees far less of the map than a wide screen at the same
   * distance, and the panel covers its bottom third — so back off as the
   * viewport narrows, and aim low so the routes sit above the panel.
   */
  function desiredCamera(aspect) {
    const n = map.nodes[followId];
    const heavenPos = new THREE.Vector3(heaven.x, heaven.y, heaven.z);
    const here = new THREE.Vector3(n.x, n.y, n.z);

    const pullBack = clamp(1.6 / Math.max(aspect, 0.42), 1, 2.3);
    const panelBias = aspect < 1.1 ? 7 : 3;

    const look = here.clone().lerp(heavenPos, 0.14);
    look.y -= panelBias;
    const pos = here.clone().add(OFFSET.clone().multiplyScalar(pullBack));
    pos.x += drift.x * 8;
    pos.y += drift.y * 5;
    return { look, pos };
  }

  const view = {
    scene, camera, anchor, map,
    onProject: null,

    setShip(placements, power) {
      if (shipMesh) shipHolder.remove(shipMesh);
      shipMesh = buildShip(placements, power);
      shipMesh.rotation.y = -Math.PI / 2; // nose down the +X road to Heaven
      shipHolder.add(shipMesh);
    },

    setCurrent(id, { animate = false } = {}) {
      const to = map.nodes[id];
      if (animate && !reduced) {
        const from = shipHolder.position.clone();
        flight = { from, to: new THREE.Vector3(to.x, to.y + 6.5, to.z), t: 0, dur: 1.15 };
      } else {
        shipHolder.position.set(to.x, to.y + 6.5, to.z);
      }
      followId = id;
    },

    /** Fade links and glows to match what the player has actually found. */
    refresh(state) {
      const cur = map.nodes[state.currentId];
      for (const g of cores.children) {
        const n = g.userData.node;
        const known = n.seen || n.type === 'heaven';
        const adjacent = cur.links.includes(n.id);
        g.visible = known || adjacent;
        const dim = !known && adjacent;
        g.userData.halo.material.opacity = n.type === 'heaven' ? 0.85 : dim ? 0.22 : n.visited ? 0.45 : 0.75;
        g.userData.core.material.emissiveIntensity = dim ? 0.15 : n.visited ? 0.35 : 0.8;
      }
      for (const line of linkLines) {
        const a = map.nodes[line.userData.a];
        const b = map.nodes[line.userData.b];
        const touching = a.id === cur.id || b.id === cur.id;
        const bothKnown = (a.seen || a.type === 'heaven') && (b.seen || b.type === 'heaven');
        line.visible = touching || bothKnown;
        line.material.opacity = touching ? 0.55 : 0.13;
        line.material.color.setHex(touching ? 0xffdd91 : 0x8fa3c8);
      }
    },

    setDrift(nx, ny) {
      drift.x = clamp(nx, -1, 1);
      drift.y = clamp(ny, -1, 1);
    },

    update(dt, t) {
      if (flight) {
        flight.t += dt;
        const k = clamp(flight.t / flight.dur, 0, 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        shipHolder.position.lerpVectors(flight.from, flight.to, e);
        shipHolder.position.y += Math.sin(e * Math.PI) * 3.5;
        if (k >= 1) flight = null;
      }
      if (!reduced) shipHolder.rotation.z = Math.sin(t * 0.7) * 0.07;

      const rect = viewRect();
      const { look, pos } = desiredCamera(rect ? rect.width / rect.height : 1.6);
      const k = firstFrame ? 1 : 1 - Math.pow(0.0015, dt);
      camPos.lerp(pos, k);
      camTarget.lerp(look, k);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      firstFrame = false;

      heavenGlow.material.opacity = 0.4 + Math.sin(t * 0.6) * 0.08;
      for (const g of cores.children) {
        if (!g.visible) continue;
        if (!reduced) g.userData.core.rotation.y += dt * 0.5;
      }

      if (view.onProject) view.onProject(project());
    },
  };

  function project() {
    const rect = viewRect();
    if (!rect) return [];
    const v = new THREE.Vector3();
    const out = [];
    for (const g of cores.children) {
      const n = g.userData.node;
      if (!g.visible) { out.push({ id: n.id, visible: false }); continue; }
      v.set(n.x, n.y, n.z).project(camera);
      const behind = v.z > 1;
      out.push({
        id: n.id,
        visible: !behind,
        x: (v.x * 0.5 + 0.5) * rect.width,
        y: (-v.y * 0.5 + 0.5) * rect.height,
        depth: v.z,
      });
    }
    return out;
  }

  view.shipHolder = shipHolder;
  return view;
}

/**
 * The arrival scene: the ship makes its last approach into the light, then
 * comes apart into the parts it was always going to become.
 */
export function makeArrivalView(anchor, placements, power) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
  camera.position.set(0, 5.4, 18);
  camera.lookAt(0, 0.5, -2);
  skyLights(scene, 0xfff3c4, 0x2a3a7a);
  scene.add(starfield(800, 200, 0xd8dcff));

  const gate = glowSprite(0xfff3c4, 46, 0.75);
  gate.position.set(0, 1.5, -26);
  scene.add(gate);
  const inner = glowSprite(0xffffff, 14, 0.9);
  inner.position.set(0, 1.5, -24);
  scene.add(inner);

  const holder = new THREE.Group();
  holder.scale.setScalar(0.72);
  scene.add(holder);
  const ship = buildShip(placements, power);
  holder.add(ship);
  holder.position.set(0, -1.2, 6);

  // Every piece remembers where it started so it can drift away from there.
  const pieces = (ship.userData.parts?.children || ship.children).map((c) => ({
    obj: c,
    home: c.position.clone(),
    dir: new THREE.Vector3(
      (Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.3, (Math.random() - 0.5) * 2
    ).normalize(),
    spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6),
  }));

  let phase = 'approach';
  let elapsed = 0;
  const reduced = prefersReducedMotion();

  return {
    scene, camera, anchor,
    get phase() { return phase; },
    dissolve() { if (phase === 'approach') { phase = 'dissolve'; elapsed = 0; } },
    update(dt, t) {
      elapsed += dt;
      holder.rotation.y = reduced ? 0.5 : t * 0.16;

      if (phase === 'approach') {
        holder.position.z = Math.max(-5, 6 - elapsed * 1.5);
        gate.material.opacity = clamp(0.55 + elapsed * 0.07, 0, 1);
        inner.scale.setScalar(14 + Math.sin(t * 0.9) * 1.5);
        if (elapsed > 6.5) { phase = 'dissolve'; elapsed = 0; }
      } else {
        const k = clamp(elapsed / 7, 0, 1);
        for (const p of pieces) {
          p.obj.position.copy(p.home).addScaledVector(p.dir, k * k * 14);
          p.obj.rotation.x += p.spin.x * dt;
          p.obj.rotation.y += p.spin.y * dt;
          p.obj.rotation.z += p.spin.z * dt;
          p.obj.scale.setScalar(clamp(1 - k * 0.55, 0.4, 1));
        }
        gate.material.opacity = 0.75 + Math.sin(t * 0.7) * 0.12;
      }
    },
  };
}
