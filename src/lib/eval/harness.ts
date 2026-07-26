import type { Extraction } from "@/lib/ingestion/extraction";

export type EvalPair = {
  id: string;
  golden: Extraction; // human-arbitrated truth
  predicted: Extraction | null; // model output (null = not detected / extract failed)
};

// Structured fields worth grading. rawServiceName included but is fuzzy
// (case-insensitive exact) — normalization is a separate Week-5 concern.
export const SCORED_FIELDS = [
  "rawServiceName",
  "amount",
  "currency",
  "cycle",
  "category",
  "emailSignalType",
  "nextBillingDate",
  "isTrial",
  "trialEndsAt",
] as const;

export type BinaryMetrics = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  fpIds: string[];
  fnIds: string[];
};

export type FieldMetric = {
  field: string;
  correct: number;
  total: number; // true-positive pairs scored
  accuracy: number;
  asserted: number; // how many golden entries actually carry this field
  mismatches: { id: string; golden: unknown; predicted: unknown }[];
};

export type EvalReport = {
  count: number;
  binary: BinaryMetrics;
  fields: FieldMetric[];
};

function ratio(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

// Treats both-absent as equal; numbers exact; strings case-insensitive trimmed.
function eq(a: unknown, b: unknown): boolean {
  const aEmpty = a === undefined || a === null;
  const bEmpty = b === undefined || b === null;
  if (aEmpty || bEmpty) return aEmpty && bEmpty;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string")
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a === b;
}

export function evaluate(
  pairs: EvalPair[],
  fields: readonly string[] = SCORED_FIELDS,
): EvalReport {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const fpIds: string[] = [];
  const fnIds: string[] = [];

  for (const p of pairs) {
    const g = p.golden.isSubscriptionRelated === true;
    const pred = p.predicted?.isSubscriptionRelated === true;
    if (g && pred) tp += 1;
    else if (!g && pred) (fp += 1), fpIds.push(p.id);
    else if (g && !pred) (fn += 1), fnIds.push(p.id);
    else tn += 1;
  }

  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = ratio(2 * precision * recall, precision + recall);

  // Field accuracy is measured only on true positives so that a detection miss
  // (already counted in recall) doesn't double-penalize as extraction error.
  const tpPairs = pairs.filter(
    (p) => p.golden.isSubscriptionRelated === true && p.predicted?.isSubscriptionRelated === true,
  );

  const fieldMetrics: FieldMetric[] = fields.map((field) => {
    let correct = 0;
    let asserted = 0;
    const mismatches: FieldMetric["mismatches"] = [];
    for (const p of tpPairs) {
      const gv = (p.golden as Record<string, unknown>)[field];
      const pv = (p.predicted as Record<string, unknown> | null)?.[field];
      if (gv !== undefined && gv !== null) asserted += 1;
      if (eq(gv, pv)) correct += 1;
      else mismatches.push({ id: p.id, golden: gv, predicted: pv });
    }
    return {
      field,
      correct,
      total: tpPairs.length,
      accuracy: ratio(correct, tpPairs.length),
      asserted,
      mismatches,
    };
  });

  return {
    count: pairs.length,
    binary: { tp, fp, fn, tn, precision, recall, f1, fpIds, fnIds },
    fields: fieldMetrics,
  };
}
