/**
 * Patch MeshToon materials so PointLight falloff is three hard discs.
 * Per-lamp core/mid radii are packed into `pointLight.decay`
 * (see packLampDiscDecay in threeLighting); rim = cutoff distance.
 *
 * Installs into ShaderChunk.lights_pars_begin (idempotent) and tags
 * materials so programs recompile against the patched chunk.
 */
import { ShaderChunk, type Material } from "three";

const CACHE_KEY = "ember-lamp-discs-v4";

let installed = false;

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

const EMBER_MARKER = "Ember cartoon lamp discs v4";

const EMBER_ATTEN = `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	// ${EMBER_MARKER} — core/mid packed in decay, rim = cutoff.
	if ( cutoffDistance <= 0.0 ) {
		return 1.0 / max( pow( lightDistance, max( decayExponent, 0.001 ) ), 0.01 );
	}
	float t = lightDistance / cutoffDistance;
	if ( t >= 1.0 ) return 0.0;
	float pack = decayExponent;
	float coreT = floor( pack + 1e-3 ) / 1000.0;
	float midT = pack - floor( pack + 1e-3 );
	if ( coreT < 0.001 || midT < 0.001 || midT <= coreT ) {
		coreT = 0.4;
		midT = 0.7;
	}
	// Stronger mid/rim so vertical wall faces stay readable under MeshToon.
	if ( t < coreT ) return 1.0;
	if ( t < midT ) return 0.55;
	return 0.22;

}`;

function patchLightsParsBegin(stock: string): string {
  for (const stockAtten of STOCK_ATTEN_VARIANTS) {
    if (stock.includes(stockAtten)) {
      return stock.replace(stockAtten, EMBER_ATTEN);
    }
  }
  const replaced = stock.replace(
    /float getDistanceAttenuation\s*\([^)]*\)\s*\{[\s\S]*?^\}/m,
    EMBER_ATTEN.trim(),
  );
  return replaced.includes(EMBER_MARKER) ? replaced : stock;
}

/** Idempotent: patch the shared chunk once for all Ember toon materials. */
export function installEmberLampDiscFalloff(): void {
  if (installed) return;
  const stock = ShaderChunk.lights_pars_begin;
  if (!stock.includes("float getDistanceAttenuation")) {
    installed = true;
    return;
  }
  if (stock.includes(EMBER_MARKER)) {
    installed = true;
    return;
  }
  ShaderChunk.lights_pars_begin = patchLightsParsBegin(stock);
  installed = true;
}

/** Idempotent: safe to call on every toon material we create. */
export function patchEmberLampDiscFalloff(material: Material): void {
  installEmberLampDiscFalloff();
  material.customProgramCacheKey = () => CACHE_KEY;
  material.needsUpdate = true;
}
