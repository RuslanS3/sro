/**
 * Pool of phrases used to fill field "09 Důvod dobrovolné registrace"
 * (voluntary VAT registration reason).
 *
 * The portal accepts free-form Czech text. We keep multiple paraphrased
 * variants so submissions look natural across batches and don't all carry
 * the same exact sentence.
 *
 * Used from:
 *   - renderer (App.tsx)        — initial form value + "regenerate" button
 *   - main page-class fallback  — registration-data.page.ts when payload is empty
 *
 * Lives under `src/shared/` so both processes import the same array.
 */

export const VOLUNTARY_REGISTRATION_REASONS: readonly string[] = [
  'Překročení obratu pro povinnou registraci k DPH v nejbližší době, činnost je již zahájena.',
  'Překročení obratu pro povinnou registraci k DPH se očekává v nejbližší době, ekonomická činnost probíhá.',
  'V nejbližší době dojde k překročení obratu pro povinnou registraci k DPH, činnost je zahájena.',
  'Očekávané překročení obratu pro povinnou registraci k DPH, podnikatelská činnost již probíhá.',
  'Povinná registrace k DPH z důvodu blížícího se překročení obratu, činnost je již zahájena.'
] as const;

/** Pick a uniformly-random phrase from the pool. Stable types, no external deps. */
export function pickRandomVoluntaryReason(): string {
  const i = Math.floor(Math.random() * VOLUNTARY_REGISTRATION_REASONS.length);
  return VOLUNTARY_REGISTRATION_REASONS[i];
}
