"use client";

import { useState, useTransition } from "react";
import { getSubscriptionEmails } from "@/app/actions/emails";
import { ingestSubscriptionEmails } from "@/app/actions/ingest";
import type { IngestStats } from "@/lib/ingestion";
import type { SubscriptionEmail } from "@/lib/gmail";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function EmailList() {
  const [emails, setEmails] = useState<SubscriptionEmail[]>([]);
  const [selected, setSelected] = useState<SubscriptionEmail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isIngesting, startIngestTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [ingestStats, setIngestStats] = useState<IngestStats | null>(null);

  const onFetch = () => {
    setError(null);
    startTransition(async () => {
      try {
        const data = await getSubscriptionEmails();
        setEmails(data);
        setHasFetched(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };

  const onIngest = () => {
    setError(null);
    setIngestStats(null);
    startIngestTransition(async () => {
      try {
        const stats = await ingestSubscriptionEmails();
        setIngestStats(stats);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onFetch} disabled={isPending}>
          {isPending ? "Fetching…" : "Fetch subscription emails (90d)"}
        </Button>
        <Button
          variant="secondary"
          onClick={onIngest}
          disabled={isIngesting}
        >
          {isIngesting ? "Ingesting…" : "Ingest 90d to DB"}
        </Button>
        {emails.length > 0 && (
          <>
            <Button
              variant="outline"
              onClick={() => downloadJson(emails)}
            >
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadTxt(emails)}
            >
              Download TXT
            </Button>
          </>
        )}
        {hasFetched && !error && (
          <span className="text-sm text-muted-foreground">
            {emails.length} 封
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {ingestStats && (
        <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">Ingest result</div>
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-5">
            <div>candidate: <span className="text-foreground">{ingestStats.candidateCount}</span></div>
            <div>skipped (already in DB): <span className="text-foreground">{ingestStats.skippedExistingCount}</span></div>
            <div>blacklisted: <span className="text-foreground">{ingestStats.blacklistedCount}</span></div>
            <div>ingested: <span className="text-foreground">{ingestStats.ingestedCount}</span></div>
            <div>subscriptions upserted: <span className="text-foreground">{ingestStats.subscriptionsUpserted}</span></div>
          </div>
        </div>
      )}

      {emails.length > 0 && (
        <div className="mt-6 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="w-[260px]">From</TableHead>
                <TableHead className="w-[180px]">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(e)}
                >
                  <TableCell className="font-medium">
                    {e.subject || "(no subject)"}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-muted-foreground">
                    {e.from}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(e.date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasFetched && emails.length === 0 && !error && (
        <p className="mt-6 text-sm text-muted-foreground">
          No subscription emails found in the past 90 days.
        </p>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {selected?.subject || "(no subject)"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>
              <span className="font-medium">From:</span> {selected?.from}
            </div>
            <div>
              <span className="font-medium">Date:</span> {selected?.date}
            </div>
          </div>
          <ScrollArea className="h-[60vh] rounded-md border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
              {selected?.body || selected?.snippet || "(empty)"}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDate(rfc2822: string): string {
  if (!rfc2822) return "";
  const d = new Date(rfc2822);
  return isNaN(d.getTime()) ? rfc2822 : d.toLocaleString();
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(emails: SubscriptionEmail[]) {
  const payload = {
    fetchedAt: new Date().toISOString(),
    count: emails.length,
    emails,
  };
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `subscribr-emails-${timestamp()}.json`,
    "application/json",
  );
}

function downloadTxt(emails: SubscriptionEmail[]) {
  const sep = "\n" + "=".repeat(80) + "\n";
  const blocks = emails.map((e, i) =>
    [
      `[${i + 1}/${emails.length}] id=${e.id}`,
      `From:    ${e.from}`,
      `Subject: ${e.subject}`,
      `Date:    ${e.date}`,
      `Snippet: ${e.snippet}`,
      "",
      "--- BODY ---",
      e.body || "(no plain text body)",
    ].join("\n"),
  );
  const content =
    `# SubScribr export · ${new Date().toISOString()} · ${emails.length} emails` +
    sep +
    blocks.join(sep) +
    sep;
  triggerDownload(
    content,
    `subscribr-emails-${timestamp()}.txt`,
    "text/plain;charset=utf-8",
  );
}
