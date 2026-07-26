import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { evaluate, SCORED_FIELDS, type EvalPair } from "@/lib/eval/harness";
import type { Extraction } from "@/lib/ingestion/extraction";
import type { GoldenEntry } from "@/lib/eval/golden";

const DIR = "docs/extractions";
const DEFAULT_GOLDEN = join(DIR, "golden-set.json");

type GoldenFile = { entries: GoldenEntry[] };
type InspectResult = { id: string; outcome: string; extraction: Extraction | null };
type InspectReport = { promptVersion: string; model: string; results: InspectResult[] };

function parseArgs() {
  let golden = DEFAULT_GOLDEN;
  let pred: string | undefined;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--golden=")) golden = a.slice("--golden=".length);
    else if (a.startsWith("--pred=")) pred = a.slice("--pred=".length);
  }
  return { golden, pred };
}

function newestInspect(): string {
  const files = readdirSync(DIR)
    .filter((f) => f.startsWith("inspect-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No inspect-*.json in ${DIR}/`);
  return join(DIR, files[files.length - 1]);
}

function pct(n: number): string {
  return (n * 100).toFixed(1).padStart(5) + "%";
}

function main() {
  const { golden, pred } = parseArgs();
  const predPath = pred ?? newestInspect();

  const goldenFile = JSON.parse(readFileSync(golden, "utf-8")) as GoldenFile;
  const report = JSON.parse(readFileSync(predPath, "utf-8")) as InspectReport;

  // Only reviewed entries are trustworthy ground truth.
  const reviewed = goldenFile.entries.filter((e) => e.reviewed);
  const predById = new Map(report.results.map((r) => [r.id, r]));

  const pairs: EvalPair[] = [];
  let unmatched = 0;
  for (const g of reviewed) {
    const r = predById.get(g.id);
    if (!r) {
      unmatched += 1;
      continue;
    }
    pairs.push({
      id: g.id,
      golden: g.golden,
      predicted: r.outcome === "extracted" ? r.extraction : null,
    });
  }

  const result = evaluate(pairs);
  const b = result.binary;

  const lines: string[] = [];
  lines.push(`# Eval: ${basename(predPath)} (${report.promptVersion}) vs ${basename(golden)}`);
  lines.push(`model=${report.model}  pairs=${pairs.length}  unmatched=${unmatched}\n`);
  lines.push(`## isSubscriptionRelated (binary)`);
  lines.push(`precision=${pct(b.precision)}  recall=${pct(b.recall)}  f1=${pct(b.f1)}`);
  lines.push(`confusion: TP=${b.tp} FP=${b.fp} FN=${b.fn} TN=${b.tn}`);
  if (b.fpIds.length) lines.push(`FP ids (false alarms): ${b.fpIds.join(", ")}`);
  if (b.fnIds.length) lines.push(`FN ids (missed subs):  ${b.fnIds.join(", ")}`);
  lines.push(`\n## per-field accuracy (over ${result.fields[0]?.total ?? 0} true-positive pairs)`);
  lines.push(`field             acc      correct/total  golden-asserted`);
  for (const f of result.fields) {
    lines.push(
      `${f.field.padEnd(17)} ${pct(f.accuracy)}  ${String(f.correct + "/" + f.total).padEnd(13)}  ${f.asserted}`,
    );
  }
  const fieldMiss = result.fields.flatMap((f) =>
    f.mismatches.map((m) => `- ${f.field.padEnd(16)} id=${m.id}  golden=${JSON.stringify(m.golden)}  pred=${JSON.stringify(m.predicted)}`),
  );
  if (fieldMiss.length) {
    lines.push(`\n## field mismatches (${fieldMiss.length})`);
    lines.push(...fieldMiss);
  }

  const text = lines.join("\n");
  console.log(text);

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(DIR, `eval-${report.promptVersion}-${ts}.json`);
  writeFileSync(outPath, JSON.stringify({ predFile: basename(predPath), goldenFile: basename(golden), promptVersion: report.promptVersion, model: report.model, ...result }, null, 2), "utf-8");
  console.log(`\nWrote ${outPath}`);
}

main();
