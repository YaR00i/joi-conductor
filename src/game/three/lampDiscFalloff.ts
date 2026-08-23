/**
 * Patch MeshToon materials so PointLight falloff is three hard discs.
 * Per-lamp core/mid radii are packed into `pointLight.decay`
 * (see packLampDiscDecay in threeLighting); rim = cutoff distance.
 *
 * Installs into ShaderChunk.lights_pars_begin (idempotent) and tags
 * materials so programs recompile against the patched chunk.
 */
import { ShaderChunk, type Material } from "three";

const CACHE_KEY = "ember-lamp-discs-v5";

/** Runtime Three builds strip Frostbite comments; source keeps them. */
const STOCK_ATTEN_VARIANTS = [
  `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	// based upon Frostbite 3 Moving to Physically-based Rendering
	// page 32, equation 26: E[window1]
	// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );

	if ( cutoffDistance > 0.0 ) {

		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );

	}

	return distanceFalloff;

}`,
  `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );

	if ( cutoffDistance > 0.0 ) {

		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );

	}

	return distanceFalloff;

}`,
];

const EMBER_MARKER = "Ember cartoon lamp discs v5";

const EMBER_ATTEN = `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	// ${EMBER_MARKER} — core/mid packed in decay, rim = cutoff.
	// decay >= 2000 → soft rings (smooth disc steps + soft outer cutoff).
	if ( cutoffDistance <= 0.0 ) {
		return 1.0 / max( pow( lightDistance, max( decayExponent, 0.001 ) ), 0.01 );
	}
	float t = lightDistance / cutoffDistance;
	if ( t >= 1.0 ) return 0.0;
	float pack = decayExponent;
	float softRings = 0.0;
	if ( pack >= 1500.0 ) {
		softRings = 1.0;
		pack -= 2000.0;
	}
	float coreT = floor( pack + 1e-3 ) / 1000.0;
	float midT = pack - floor( pack + 1e-3 );
	if ( coreT < 0.001 || midT < 0.001 || midT <= coreT ) {
		coreT = 0.4;
		midT = 0.7;
	}
	if ( softRings > 0.5 ) {
		float w = mix( 0.028, 0.09, t );
		float a = 1.0;
		a = mix( a, 0.55, smoothstep( coreT - w, coreT + w, t ) );
		a = mix( a, 0.22, smoothstep( midT - w, midT + w, t ) );
		float edgeW = mix( 0.06, 0.22, smoothstep( midT, 1.0, t ) );
		float lit = 1.0 - smoothstep( 1.0 - edgeW, 1.0, t );
		return a * lit;
	}
	// Stronger mid/rim so vertical wall faces stay readable under MeshToon.
	if ( t < coreT ) return 1.0;
	if ( t < midT ) return 0.55;
	return 0.22;

}
`;

function replaceDistanceAttenuation(chunk: string, next: string): string {
  const sig = "float getDistanceAttenuation(";
  const start = chunk.indexOf(sig);
  if (start < 0) return chunk;
  const brace = chunk.indexOf("{", start);
  if (brace < 0) return chunk;
  let depth = 0;
  for (let i = brace; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return chunk.slice(0, start) + next.trim() + chunk.slice(i + 1);
      }
    }
  }
  return chunk;
}

function patchLightsParsBegin(stock: string): string {
  for (const stockAtten of STOCK_ATTEN_VARIANTS) {
    if (stock.includes(stockAtten)) {
      return stock.replace(stockAtten, EMBER_ATTEN);
    }
  }
  const replaced = replaceDistanceAttenuation(stock, EMBER_ATTEN);
  return replaced.includes(EMBER_MARKER) ? replaced : stock;
}

/** Idempotent: patch the shared chunk once for all Ember toon materials. */
export function installEmberLampDiscFalloff(): void {
  const stock = ShaderChunk.lights_pars_begin;
  if (!stock || !stock.includes("float getDistanceAttenuation")) {
    return;
  }
  if (stock.includes(EMBER_MARKER)) {
    return;
  }
  ShaderChunk.lights_pars_begin = patchLightsParsBegin(stock);
}

/** Idempotent: safe to call on every toon material we create. */
export function patchEmberLampDiscFalloff(material: Material): void {
  installEmberLampDiscFalloff();
  material.customProgramCacheKey = () => CACHE_KEY;
  material.needsUpdate = true;
}
