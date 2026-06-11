import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import pMap from "p-map";
import { generateObject } from "ai";
import { getModel } from "@/lib/llm";
import { isBlacklisted } from "@/lib/blacklist";
import {
  ExtractionSchema,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  formatUserPrompt,
  type Extraction,
} from "@/lib/extraction";
import type { SubscriptionEmail } from "@/lib/gmail";

const SAMPLE_DIR = "sampleEmail";
const OUT_DIR = "docs/extractions";

type Fixture = {
  fetchedAt: string;
  count: number;
  emails: SubscriptionEmail[];
};

type InspectResult = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string; // 人工判斷 FP 需要全文；輸出檔已 gitignore
  outcome: "extracted" | "extract_failed" | "blacklisted";
  extraction: Extraction | null;
  error: { name: string; message: string } | null;
};

type InspectReport = {
  promptVersion: string;
  model: string;
  fixture: string;
  ranAt: string;
  args: { onlyTrue: boolean; limit: number | null; concurrency: number };
  summary: {
    total: number;
    blacklisted: number;
    true: number;
    false: number;
    extractFailed: number;
  };
  results: InspectResult[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let compare: string | undefined;
  let limit: number | undefined;
  let concurrency = 20; // match ingestion pipeline default
  let onlyTrue = false;
  for (const a of args) {
    if (a.startsWith("--file=")) file = a.slice("--file=".length);
    else if (a.startsWith("--compare=")) compare = a.slice("--compare=".length);
    else if (a.startsWith("--limit=")) limit = Number(a.slice("--limit=".length));
    else if (a.startsWith("--concurrency="))
      concurrency = Number(a.slice("--concurrency=".length));
    else if (a === "--only-true") onlyTrue = true;
  }
  return { file, compare, limit, concurrency, onlyTrue };
}

function newestFixture(): string {
  const files = readdirSync(SAMPLE_DIR)
    .filter((f) => f.startsWith("subscribr-emails-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No fixture in ${SAMPLE_DIR}/`);
  return join(SAMPLE_DIR, files[files.length - 1]);
}

// 與 production processEmail 同一決策樹：blacklist gate → llm extract。
// 直接呼叫 generateObject（而非 llmExtract）以保留 error 細節；
// prompt/schema/model 與 production 完全同源。
async function inspectOne(email: SubscriptionEmail): Promise<InspectResult> {
  const base = {
    id: email.id,
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    body: email.body,
  };
  if (isBlacklisted(email)) {
    return { ...base, outcome: "blacklisted", extraction: null, error: null };
  }
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema: ExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt: formatUserPrompt(email),
    });
    return { ...base, outcome: "extracted", extraction: object, error: null };
  } catch (err) {
    return {
      ...base,
      outcome: "extract_failed",
      extraction: null,
      error: {
        name: err instanceof Error ? err.name : "Unknown",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function trunc(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
}

function flag(r: InspectResult): "true" | "false" | "failed" | "blacklisted" {
  if (r.outcome === "blacklisted") return "blacklisted";
  if (r.outcome === "extract_failed") return "failed";
  return r.extraction?.isSubscriptionRelated ? "true" : "false";
}

function printCompare(oldPath: string, current: InspectResult[]): void {
  const old = JSON.parse(readFileSync(oldPath, "utf-8")) as InspectReport;
  if (old.args.onlyTrue) {
    console.warn(
      `⚠️  ${oldPath} 是 --only-true 輸出，缺 false 側資料，false→true 翻轉偵測不完整。請用全量 JSON 當 compare 基準。`,
    );
  }
  const oldById = new Map(old.results.map((r) => [r.id, r]));

  const trueToFalse: [InspectResult, InspectResult][] = [];
  const falseToTrue: [InspectResult, InspectResult][] = [];
  const failedInvolved: [InspectResult | undefined, InspectResult][] = [];
  let stableTrue = 0;
  let stableFalse = 0;
  let notInOld = 0;

  for (const cur of current) {
    const prev = oldById.get(cur.id);
    if (!prev) {
      notInOld += 1;
      continue;
    }
    const a = flag(prev);
    const b = flag(cur);
    if (a === "failed" || b === "failed") failedInvolved.push([prev, cur]);
    else if (a === "true" && b === "false") trueToFalse.push([prev, cur]);
    else if (a === "false" && b === "true") falseToTrue.push([prev, cur]);
    else if (a === "true" && b === "true") stableTrue += 1;
    else if (a === "false" && b === "false") stableFalse += 1;
  }

  const reason = (r: InspectResult) =>
    r.extraction?.isSubscriptionRelated
      ? `true (${r.extraction.rawServiceName ?? "?"})`
      : `false (${r.extraction?.notSubscriptionReason ?? "?"})`;

  console.log(
    `\n# Compare: ${basename(oldPath)} (${old.promptVersion}) → ${PROMPT_VERSION}\n`,
  );

  console.log(
    `## true → false（期望：都是標記的 false positives）— ${trueToFalse.length} 筆\n`,
  );
  console.log(`| id | subject | old | new |`);
  console.log(`|---|---|---|---|`);
  for (const [p, c] of trueToFalse)
    console.log(
      `| ${c.id} | ${trunc(c.subject, 50)} | ${reason(p)} | ${reason(c)} |`,
    );

  console.log(
    `\n## false → true（⚠️ regression 或噪音，逐筆檢查）— ${falseToTrue.length} 筆\n`,
  );
  console.log(`| id | subject | old | new |`);
  console.log(`|---|---|---|---|`);
  for (const [p, c] of falseToTrue)
    console.log(
      `| ${c.id} | ${trunc(c.subject, 50)} | ${reason(p)} | ${reason(c)} |`,
    );

  console.log(
    `\n## 任一側 extract_failed（無法比較）— ${failedInvolved.length} 筆\n`,
  );
  for (const [, c] of failedInvolved)
    console.log(`- ${c.id} ${trunc(c.subject, 50)}`);

  console.log(
    `\n不變：true→true ${stableTrue}、false→false ${stableFalse}；舊檔缺席 ${notInOld} 筆\n`,
  );
}

async function main() {
  const { file, compare, limit, concurrency, onlyTrue } = parseArgs();
  const path = file ?? newestFixture();
  const fixture = JSON.parse(readFileSync(path, "utf-8")) as Fixture;
  const emails = limit ? fixture.emails.slice(0, limit) : fixture.emails;

  const started = Date.now();
  const results = await pMap(emails, inspectOne, {
    concurrency,
    stopOnError: false,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const summary = {
    total: results.length,
    blacklisted: results.filter((r) => flag(r) === "blacklisted").length,
    true: results.filter((r) => flag(r) === "true").length,
    false: results.filter((r) => flag(r) === "false").length,
    extractFailed: results.filter((r) => flag(r) === "failed").length,
  };

  const model = getModel();
  const report: InspectReport = {
    promptVersion: PROMPT_VERSION,
    model: typeof model === "string" ? model : model.modelId,
    fixture: basename(path),
    ranAt: new Date().toISOString(),
    args: { onlyTrue, limit: limit ?? null, concurrency },
    summary,
    results: onlyTrue ? results.filter((r) => flag(r) === "true") : results,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(OUT_DIR, `inspect-${PROMPT_VERSION}-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Wrote ${outPath} (${elapsed}s, concurrency=${concurrency})`);
  console.log(
    `total=${summary.total} blacklisted=${summary.blacklisted} true=${summary.true} false=${summary.false} failed=${summary.extractFailed}`,
  );

  if (compare) printCompare(compare, results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
