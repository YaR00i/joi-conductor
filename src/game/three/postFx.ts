/**
 * Bloom + color-grade + miniature tilt-shift post stack for Three.js Ember.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import type { EmberMapGrade } from "../content/types";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    brightness: { value: 1 },
    saturation: { value: 1 },
    warm: { value: 0 },
    vignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float brightness;
    uniform float saturation;
    uniform float warm;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= brightness;
      float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(g), c.rgb, saturation);
      c.r += warm * 0.08;
      c.b -= warm * 0.05;
      if (vignette > 0.001) {
        vec2 q = vUv * 2.0 - 1.0;
        float v = smoothstep(0.35, 1.35, length(q));
        c.rgb *= 1.0 - v * vignette * 0.85;
      }
      gl_FragColor = c;
    }
  `,
};

/** Screen-Y tilt-shift (diorama / toy miniature). No depth buffer. */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tiltShift: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float tiltShift;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      if (tiltShift < 0.004) {
        gl_FragColor = src;
        return;
      }
      float dist = abs(vUv.y - 0.47);
      float coc = smoothstep(0.05, 0.46, dist) * tiltShift;
      if (coc < 0.008) {
        gl_FragColor = src;
        return;
      }
      vec2 px = vec2(1.0 / max(resolution.x, 1.0), 1.0 / max(resolution.y, 1.0));
      float r = mix(0.7, 10.0, coc);
      vec4 acc = src * 0.20;
      acc += texture2D(tDiffuse, vUv + vec2( r,  0.0) * px) * 0.12;
      acc += texture2D(tDiffuse, vUv + vec2(-r,  0.0) * px) * 0.12;
      acc += texture2D(tDiffuse, vUv + vec2( 0.0,  r) * px) * 0.12;
      acc += texture2D(tDiffuse, vUv + vec2( 0.0, -r) * px) * 0.12;
      acc += texture2D(tDiffuse, vUv + vec2( r,  r) * px) * 0.08;
      acc += texture2D(tDiffuse, vUv + vec2(-r,  r) * px) * 0.08;
      acc += texture2D(tDiffuse, vUv + vec2( r, -r) * px) * 0.08;
      acc += texture2D(tDiffuse, vUv + vec2(-r, -r) * px) * 0.08;
      gl_FragColor = acc;
    }
  `,
};

export type EmberBloomOpts = {
  strength?: number;
  threshold?: number;
  radius?: number;
};

export type EmberPostFx = {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  setSize: (w: number, h: number) => void;
  setBloom: (opts: number | EmberBloomOpts) => void;
  setGrade: (
    g: EmberMapGrade | undefined,
    vignette?: number,
    tiltShift?: number,
  ) => void;
  render: () => void;
  dispose: () => void;
};

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): EmberPostFx {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Slightly softer threshold so small emissive texels survive the mip chain.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.7,
    0.55,
    0.28,
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const tilt = new ShaderPass(TiltShiftShader);
  tilt.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
  tilt.enabled = false;
  composer.addPass(tilt);

  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    grade,
    setSize(w, h) {
      composer.setSize(w, h);
      // Half-res bloom — large visual win for little quality loss on pixel art.
      bloom.setSize(
        Math.max(1, Math.floor(w * 0.5)),
        Math.max(1, Math.floor(h * 0.5)),
      );
      tilt.uniforms.resolution.value.set(Math.max(1, w), Math.max(1, h));
    },
    setBloom(opts) {
      const o = typeof opts === "number" ? { strength: opts } : opts;
      if (o.strength !== undefined) {
        bloom.strength = Math.max(0, Math.min(2.5, o.strength));
      }
      if (o.threshold !== undefined) {
        bloom.threshold = Math.max(0, Math.min(1, o.threshold));
      }
      if (o.radius !== undefined) {
        bloom.radius = Math.max(0, Math.min(2, o.radius));
      }
      bloom.enabled = bloom.strength > 0.02;
    },
    setGrade(g, vignette = 0, tiltShift = 0) {
      const u = grade.uniforms;
      u.brightness.value = g?.brightness ?? 1;
      u.saturation.value = g?.saturation ?? 1;
      u.warm.value = g?.tone ?? 0;
      u.vignette.value = Math.max(0, Math.min(1, vignette));
      const ts = Math.max(0, Math.min(1, tiltShift));
      tilt.uniforms.tiltShift.value = ts;
      tilt.enabled = ts > 0.004;
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
    },
  };
}
