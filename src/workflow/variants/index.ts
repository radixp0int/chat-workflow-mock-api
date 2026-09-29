// The catalogue. Adding a variant is: write the script, import it here.

import type { RunScript } from '../script.js';
import type { VariantId, VariantInfo } from '../types.js';
import { incidentTriage } from './incidentTriage.js';
import { loanReview } from './loanReview.js';
import { onboarding } from './onboarding.js';

export const VARIANTS: Record<VariantId, RunScript> = {
  'loan-review': loanReview,
  'incident-triage': incidentTriage,
  onboarding,
};

/** What the client's switcher draws, in the order it draws them. */
export const VARIANT_INFO: VariantInfo[] = Object.values(VARIANTS).map((s) => ({
  id: s.id,
  label: s.label,
  blurb: s.blurb,
}));

/** Unknown ids fall back rather than failing — this is a demo server. */
export function pickVariant(id: string | undefined): RunScript {
  return id && Object.hasOwn(VARIANTS, id) ? VARIANTS[id as VariantId] : loanReview;
}
