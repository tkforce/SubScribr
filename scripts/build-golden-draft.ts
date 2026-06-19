import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildGoldenDraft,
  type DraftInput,
  type GoldenEntry,
} from "@/lib/golden";
import type { Extraction } from "@/lib/extraction";

const EXTRACTIONS_DIR = "docs/extractions";
const DEFAULT_OUT = join(EXTRACTIONS_DIR, "golden-set.json");

type InspectResult = {
  id: string;
  from: string;
  subject: string;
  body: string;
  outcome: string;
  extraction: Extraction | null;
};
type InspectReport = { promptVersion: string; results: InspectResult[] };
type GoldenFile = {
  draftedFrom: string;
  draftedAt: string;
  entries: GoldenEntry[];
};

function parseArgs() {
  let from: string | undefined;
  let out = DEFAULT_OUT;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--from=")) from = a.slice("--from=".length);
    else if (a.startsWith("--out=")) out = a.slice("--out=".length);
  }
  return { from, out };
}

// Newest inspect-*.json so the draft seeds from the best current prompt.
function newestInspect(): string {
  const files = readdirSync(EXTRACTIONS_DIR)
    .filter((f) => f.startsWith("inspect-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0)
    throw new Error(`No inspect-*.json in ${EXTRACTIONS_DIR}/ — run inspect:extractions first`);
  return join(EXTRACTIONS_DIR, files[files.length - 1]);
}

function main() {
  const { from, out } = parseArgs();
  const fromPath = from ?? newestInspect();

  const report = JSON.parse(readFileSync(fromPath, "utf-8")) as InspectReport;
  const inputs: DraftInput[] = report.results.map((r) => ({
    id: r.id,
    from: r.from,
    subject: r.subject,
    body: r.body,
    outcome: r.outcome,
    extraction: r.extraction,
  }));

  const existing: GoldenEntry[] = existsSync(out)
    ? (JSON.parse(readFileSync(out, "utf-8")) as GoldenFile).entries
    : [];

  const { entries, stats } = buildGoldenDraft(inputs, existing);

  const file: GoldenFile = {
    draftedFrom: fromPath,
    draftedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(out, JSON.stringify(file, null, 2), "utf-8");

  const unreviewed = entries.filter((e) => !e.reviewed).length;
  console.log(`Wrote ${out} (seed: ${fromPath}, prompt ${report.promptVersion})`);
  console.log(
    `total=${stats.total} added=${stats.added} refreshed=${stats.refreshed} preservedReviewed=${stats.preservedReviewed}`,
  );
  console.log(`→ ${unreviewed}/${stats.total} 筆待審核 (reviewed=false)`);
}

main();
