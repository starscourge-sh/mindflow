/**
 * PaperCrumple, from React Bits (https://reactbits.dev/animations/paper-crumple,
 * https://github.com/DavidHDev/react-bits), copied as published (TS + Tailwind).
 * Copyright (c) David Haz. Licence: MIT + Commons Clause (use in a product is allowed;
 * selling the component itself is not).
 *
 * Haligtree's changes: the folding is React Bits' own (its springs, `deform`,
 * its materials and light, its fold path in paper-path.ts), but the setup and
 * teardown moved. One renderer, one scene and one set of compiled materials
 * live for the whole app, warmed while it is idle (`warmStage`); a move to the
 * Bin only swaps the picture and the fold path and lays the one canvas over
 * the row. No pointer, drag or keys: a click on "Move to the Bin" crumples it.
 */
import * as THREE from 'three';
import { paperMesh, paperPathFor, type PaperPath } from './paper-path';

type Spring = { value: number; target: number; velocity: number };
const spring = (value = 0): Spring => ({ value, target: value, velocity: 0 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function advance(s: Spring, dt: number, duration: number, instant: boolean) {
  if (instant || duration <= 0) {
    s.value = s.target;
    s.velocity = 0;
    return false;
  }
  const omega = 8 / Math.max(0.06, duration);
  const offset = s.value - s.target;
  const term = s.velocity + omega * offset;
  const decay = Math.exp(-omega * dt);
  s.value = s.target + (offset + term * dt) * decay;
  s.velocity = (s.velocity - omega * term * dt) * decay;
  if (Math.abs(s.value - s.target) < 0.0001 && Math.abs(s.velocity) < 0.001) {
    s.value = s.target;
    s.velocity = 0;
    return false;
  }
  return true;
}

/** React Bits' settings as the user chose them (its own example), the same for every sheet. */
export const PAPER = {
  crumpleAmount: 0.85,
  crumpleDuration: 0.55,
  foldCount: 6,
  foldSharpness: 0.6,
  wrinkleDepth: 0.65,
  paperTexture: 0.08,
  roughness: 0.92,
  lightIntensity: 1.8,
  lightAngle: -35,
  shadowOpacity: 0.08,
  seed: 7,
  detail: 64
};

/** One paper shape's mesh, built once: its geometry, its fold path and the buffers `deform` writes. */
type Shape = {
  aspect: number;
  shortSide: number;
  original: Float32Array;
  positions: Float32Array;
  indices: number[];
  geometry: THREE.BufferGeometry;
  renderPositions: Float32Array;
  renderNormals: Float32Array;
  faceNormals: Float32Array;
  incidentFaces: number[][];
  paperPath: PaperPath;
};

function buildShape(paperWidth: number, paperHeight: number): Shape {
  const sharpness = PAPER.foldSharpness;
  const { aspect, shortSide, count, original, uvs, indices } = paperMesh(paperWidth, paperHeight, PAPER.detail, PAPER.seed);
  const paperPath = paperPathFor(paperWidth, paperHeight, PAPER.detail, PAPER.foldCount, sharpness, PAPER.wrinkleDepth, PAPER.seed);
  const positions = new Float32Array(count * 3);
  const renderPositions = new Float32Array(indices.length * 3);
  const renderNormals = new Float32Array(indices.length * 3);
  const renderUvs = new Float32Array(indices.length * 2);
  const faceNormals = new Float32Array(indices.length);
  const incidentFaces: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < indices.length; i++) {
    renderUvs[i * 2] = uvs[indices[i] * 2];
    renderUvs[i * 2 + 1] = uvs[indices[i] * 2 + 1];
    incidentFaces[indices[i]].push(Math.floor(i / 3) * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(renderPositions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(renderNormals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(renderUvs, 2));
  return { aspect, shortSide, original, positions, indices, geometry, renderPositions, renderNormals, faceNormals, incidentFaces, paperPath };
}

/** The one stage: renderer, scene, materials, light, all made once. */
type Stage = ReturnType<typeof makeStage>;
let stage: Stage | null = null;
const shapes = new Map<string, Shape>();

function makeStage() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-paper-stage', '');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', zIndex: '60', pointerEvents: 'none', visibility: 'hidden' });
  document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const rng = Math.random;
  const grainData = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < grainData.length; i += 4) {
    const value = 100 + Math.floor(rng() * 155);
    grainData[i] = grainData[i + 1] = grainData[i + 2] = value;
    grainData[i + 3] = 255;
  }
  const grain = new THREE.DataTexture(grainData, 128, 128);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearFilter;
  grain.needsUpdate = true;
  const materialOptions = {
    roughness: clamp(PAPER.roughness, 0, 1),
    metalness: 0,
    bumpMap: grain,
    bumpScale: clamp(PAPER.paperTexture, 0, 1) * 0.32,
    alphaTest: 0.04,
    alphaToCoverage: true,
    flatShading: false
  };
  const frontMaterial = new THREE.MeshStandardMaterial({ ...materialOptions, side: THREE.FrontSide });
  const backMaterial = new THREE.MeshStandardMaterial({ ...materialOptions, side: THREE.BackSide, color: '#f4f0e8' });
  const lighting = { value: 0 };
  for (const material of [frontMaterial, backMaterial]) {
    material.onBeforeCompile = shader => {
      shader.uniforms.paperLighting = lighting;
      shader.fragmentShader = 'uniform float paperLighting;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
          #include <map_fragment>
          #ifdef USE_MAP
            if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;
            ${material === backMaterial ? 'diffuseColor.rgb = diffuse;' : ''}
          #endif
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
          outgoingLight = mix(diffuseColor.rgb, outgoingLight, paperLighting);
          #include <opaque_fragment>
        `
      );
    };
    material.customProgramCacheKey = () => `paper-${material === backMaterial ? 'stock' : 'print'}`;
  }
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.04, side: THREE.DoubleSide });
  depthMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
        #include <map_fragment>
        #ifdef USE_MAP
          if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;
        #endif
      `
    );
  };
  // A stand-in picture so the shaders are compiled with a map, as every real sheet has one.
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.colorSpace = THREE.SRGBColorSpace;
  blank.needsUpdate = true;
  frontMaterial.map = backMaterial.map = depthMaterial.map = blank;
  const sheet = new THREE.Group();
  const front = new THREE.Mesh(new THREE.BufferGeometry(), frontMaterial);
  const back = new THREE.Mesh(front.geometry, backMaterial);
  front.castShadow = true;
  front.receiveShadow = true;
  back.receiveShadow = true;
  front.customDepthMaterial = depthMaterial;
  sheet.add(front, back);
  const scene = new THREE.Scene();
  scene.add(sheet);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa4a0b0, 1.35));
  const light = new THREE.DirectionalLight(0xfffaf0, PAPER.lightIntensity);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.6;
  light.shadow.radius = 3;
  scene.add(light, light.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: PAPER.shadowOpacity, depthWrite: false }));
  floor.receiveShadow = true;
  scene.add(floor);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { canvas, renderer, scene, camera, sheet, front, back, frontMaterial, backMaterial, depthMaterial, lighting, light, floor, grain, blank };
}

/** The stage, made on first ask. */
function theStage(): Stage {
  stage ??= makeStage();
  return stage;
}

/** The shape for a paper this size, built once (its fold path from the cache, worked out at idle). */
function shapeFor(paperWidth: number, paperHeight: number): Shape {
  const key = (Math.round((paperHeight / paperWidth) * 1000) / 1000).toString();
  let shape = shapes.get(key);
  if (!shape) shapes.set(key, (shape = buildShape(paperWidth, paperHeight)));
  return shape;
}

/** The window size the stage was last laid out for: a new size only when the window changes. */
let laid = { width: 0, height: 0, ratio: 0 };

/**
 * Lays the stage out (React Bits' `resize`): one canvas over the whole window,
 * sized once and again only when the window changes, so a sheet never waits on
 * a new drawing buffer; the sheet `width` wide, its middle at `cx`,`cy`.
 */
function layout(s: Stage, shape: Shape, width: number, cx: number, cy: number) {
  const { renderer, camera, light, floor, sheet, canvas } = s;
  const [viewWidth, viewHeight, ratio] = [innerWidth, innerHeight, Math.min(window.devicePixelRatio || 1, 2)];
  if (laid.width !== viewWidth || laid.height !== viewHeight || laid.ratio !== ratio) {
    laid = { width: viewWidth, height: viewHeight, ratio };
    Object.assign(canvas.style, { width: `${viewWidth}px`, height: `${viewHeight}px` });
    camera.aspect = viewWidth / viewHeight;
    camera.position.z = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setPixelRatio(ratio);
    renderer.setSize(viewWidth, viewHeight, false);
    const reach = Math.max(viewWidth, viewHeight);
    const angle = THREE.MathUtils.degToRad(PAPER.lightAngle);
    light.position.set(Math.sin(angle) * reach, Math.cos(angle) * reach, reach * 4);
    light.shadow.camera.left = light.shadow.camera.bottom = -reach;
    light.shadow.camera.right = light.shadow.camera.top = reach;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = reach * 6;
    light.shadow.camera.updateProjectionMatrix();
    floor.scale.set(viewWidth * 4, viewHeight * 4, 1);
  }
  sheet.scale.setScalar(width);
  sheet.position.set(cx - viewWidth / 2, viewHeight / 2 - cy, 0);
  floor.position.z = -width * shape.shortSide * 0.12;
}

/** React Bits' `deform`, as written, for one shape at a fold amount. */
function deform(s: Stage, shape: Shape, fold: number) {
  const { paperPath, positions, original, indices, faceNormals, incidentFaces, renderPositions, renderNormals, geometry } = shape;
  const sharpness = PAPER.foldSharpness;
  const memory = 0;
  const frame = fold * (paperPath.samples.length - 1);
  const lower = Math.floor(frame);
  const upper = Math.min(lower + 1, paperPath.samples.length - 1);
  const mix = frame - lower;
  const from = paperPath.samples[lower];
  const to = paperPath.samples[upper];
  for (let i = 0; i < positions.length; i++) {
    positions[i] = from[i] + (to[i] - from[i]) * mix;
    positions[i] += (paperPath.creased[i] - original[i]) * memory * (1 - fold);
  }
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face] * 3,
      b = indices[face + 1] * 3,
      c = indices[face + 2] * 3;
    const bx = positions[b] - positions[a],
      by = positions[b + 1] - positions[a + 1],
      bz = positions[b + 2] - positions[a + 2];
    const cx = positions[c] - positions[a],
      cy = positions[c + 1] - positions[a + 1],
      cz = positions[c + 2] - positions[a + 2];
    const nx = by * cz - bz * cy,
      ny = bz * cx - bx * cz,
      nz = bx * cy - by * cx;
    const length = Math.hypot(nx, ny, nz) || 1;
    faceNormals[face] = nx / length;
    faceNormals[face + 1] = ny / length;
    faceNormals[face + 2] = nz / length;
  }
  for (let i = 0; i < indices.length; i++) {
    const source = indices[i] * 3;
    const face = Math.floor(i / 3) * 3;
    let nx = 0,
      ny = 0,
      nz = 0;
    for (const neighbor of incidentFaces[indices[i]]) {
      const dot =
        faceNormals[face] * faceNormals[neighbor] +
        faceNormals[face + 1] * faceNormals[neighbor + 1] +
        faceNormals[face + 2] * faceNormals[neighbor + 2];
      const weight = THREE.MathUtils.smoothstep(dot, 0.88 - (1 - sharpness) * 0.18, 0.98);
      nx += faceNormals[neighbor] * weight;
      ny += faceNormals[neighbor + 1] * weight;
      nz += faceNormals[neighbor + 2] * weight;
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    renderPositions[i * 3] = positions[source];
    renderPositions[i * 3 + 1] = positions[source + 1];
    renderPositions[i * 3 + 2] = positions[source + 2];
    renderNormals[i * 3] = nx / length;
    renderNormals[i * 3 + 1] = ny / length;
    renderNormals[i * 3 + 2] = nz / length;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  s.lighting.value = THREE.MathUtils.smoothstep(fold + memory, 0, 0.4);
}

/** Places the floor just behind the sheet, as React Bits does each frame. */
function placeFloor(s: Stage, shape: Shape, width: number) {
  const { sheet, floor } = s;
  sheet.updateMatrixWorld(true);
  const bounds = shape.geometry.boundingBox;
  if (!bounds) return;
  const corner = new THREE.Vector3();
  let backZ = Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
    corner.applyMatrix4(sheet.matrixWorld);
    backZ = Math.min(backZ, corner.z);
  }
  floor.position.z = backZ - width * shape.shortSide * 0.08;
}

/**
 * While the app is idle: the stage made, a shape built and every shader
 * compiled (`renderer.compile`, then one frame drawn out of sight), so the
 * first move to the Bin draws in a frame.
 */
export function warmStage(width = 1000, height = 1000 / 18): void {
  const started = performance.now();
  const s = theStage();
  const shape = shapeFor(width, height);
  s.front.geometry = s.back.geometry = shape.geometry;
  layout(s, shape, 64, innerWidth / 2, innerHeight / 2);
  deform(s, shape, 0.5);
  s.renderer.compile(s.scene, s.camera);
  s.renderer.render(s.scene, s.camera);
  performance.measure('paper:warm stage (idle)', { start: started });
}
/** Builds a shape ahead (its geometry), once its fold path is in. */
export const warmShape = (width: number, height: number): void => void shapeFor(width, height);

/** Whether a sheet is on the stage now: only one at a time; any other simply fades. */
let busy = false;
export const stageBusy = (): boolean => busy;

/**
 * A sheet on the stage: the picture `image` on paper `width` x `height`,
 * its middle at `cx`,`cy` in the window.
 * `drawn` is said once its first frame is on screen; `crumple` folds it
 * (React Bits' spring toward `crumpleAmount`); `clear` takes it off.
 */
export function stageSheet(image: ImageBitmap, width: number, height: number, cx: number, cy: number, paperColor: string, drawn: () => void) {
  const started = performance.now();
  const s = theStage();
  busy = true;
  const shape = shapeFor(width, height);
  const lap = (name: string, from: number): number => (performance.measure(`paper:  ${name}`, { start: from }), performance.now());
  let at = lap('stage + shape', started);
  const texture = new THREE.Texture(image);
  // Mipmaps: balled up, a big picture is drawn at a fraction of its size, and without them its colours shimmer
  // ("twitching even after the crumple") as the folds turn.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = Math.min(8, s.renderer.capabilities.getMaxAnisotropy());
  // 'cover', as React Bits fits a picture to its paper.
  const imageAspect = image.width / image.height;
  const targetAspect = width / height;
  let rx = 1,
    ry = 1;
  if (imageAspect > targetAspect) rx = targetAspect / imageAspect;
  else ry = imageAspect / targetAspect;
  texture.repeat.set(rx, ry);
  texture.offset.set((1 - rx) / 2, (1 - ry) / 2);
  texture.needsUpdate = true;
  s.frontMaterial.map = s.backMaterial.map = s.depthMaterial.map = texture;
  s.backMaterial.color.set(paperColor);
  s.grain.repeat.set(5, 5 * shape.aspect);
  s.front.geometry = s.back.geometry = shape.geometry;
  s.sheet.rotation.set(0, 0, 0);
  at = lap('texture + materials', at);
  layout(s, shape, width, cx, cy);
  at = lap('layout', at);
  Object.assign(s.canvas.style, { transform: 'none', transformOrigin: `${cx}px ${cy}px`, opacity: '1' });
  const amount = spring();
  let [frame, last, gone] = [0, 0, false];
  const draw = () => {
    deform(s, shape, clamp(amount.value, 0, 1));
    placeFloor(s, shape, width);
    s.renderer.render(s.scene, s.camera);
  };
  deform(s, shape, 0);
  placeFloor(s, shape, width);
  at = lap('first deform', at);
  s.renderer.render(s.scene, s.camera);
  lap('first render (upload)', at);
  performance.measure('paper:sheet (texture, shape, first draw)', { start: started });
  // On screen from the next frame the browser paints.
  s.canvas.style.visibility = 'visible';
  requestAnimationFrame(drawn);
  const tick = (time: number) => {
    frame = 0;
    if (gone) return;
    const dt = last ? Math.min(0.04, (time - last) / 1000) : 1 / 60;
    last = time;
    const moving = advance(amount, dt, PAPER.crumpleDuration, false);
    draw();
    if (moving) frame = requestAnimationFrame(tick);
  };
  return {
    canvas: s.canvas,
    crumple: () => {
      amount.target = clamp(PAPER.crumpleAmount, 0, 1);
      if (!frame) frame = requestAnimationFrame(tick);
    },
    clear: () => {
      if (gone) return;
      gone = true;
      cancelAnimationFrame(frame);
      s.canvas.getAnimations().forEach((one) => one.cancel());
      s.canvas.style.visibility = 'hidden';
      s.frontMaterial.map = s.backMaterial.map = s.depthMaterial.map = s.blank;
      texture.dispose();
      image.close();
      busy = false;
    }
  };
}
