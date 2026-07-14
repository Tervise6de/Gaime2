/**
 * Global simulation constants (rules, not tunable content).
 *
 * Content that gets balanced lives in `/src/data`; these are structural limits
 * the systems and UI both need to agree on.
 */

/** Maximum tax rate the fiscal slider allows (design doc §3.2: ~0–40%). */
export const MAX_TAX_RATE = 0.4;
