import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun, RunDetail, Flag, LineItem } from "@/lib/api";
import DecisionBadge from "@/components/DecisionBadge";
import StageCard from "@/components/StageCard";

const STAGE_DEFS = [
  { name: "Extraction", prefix: "Stage 1" },
  { name: "Validation", prefix: "Stage 2" },
  { name: "Matching", prefix: "Stage 3" },
  { name: "Decision", prefix: "Stage 4" },
];

function groupByStage(trail: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    "Stage 1": [],
    "Stage 2": [],
    "Stage 3": [],
    "Stage 4": [],
  };
  for (const line of trail) {
    const key = Object.keys(groups).find((k) => line.startsWith(k));
    if (key) groups[key].push(line);
  }
  return groups;
}

function confidenceDot(c: string) {
  if (c === "high") return "bg-green-400";
  if (c === "medium") return "bg-amber-400";
  return "bg-slate-400";
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let run: RunDetail;
  try {
    run = await getRun(id);
  } catch {
    notFound();
  }

  const stageGroups = groupByStage(run.reasoning_trail);

  return (
    <main className="min-h-screen py-8 px-6">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Back */}
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          ← Back to history
        </Link>

        {/* Decision banner */}
        <div
          className={`rounded-2xl border p-5 ${
            run.decision === "approve"
              ? "bg-green-50 border-green-200"
              : run.decision === "flag"
              ? "bg-amber-50 border-amber-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <DecisionBadge decision={run.decision} size="lg" />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${confidenceDot(run.decision_confidence)}`} />
                  Decision confidence: <span className="font-medium">{run.decision_confidence}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${confidenceDot(run.extraction_confidence)}`} />
                  Extraction confidence: <span className="font-medium">{run.extraction_confidence}</span>
                </span>
                {run.matched_po && (
                  <span>
                    Matched PO: <span className="font-medium">{run.matched_po}</span>
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 text-right shrink-0 mt-1">
              {run.invoice_filename}
            </p>
          </div>
        </div>

        {/* Flags */}
        {run.flags_raised.length > 0 && (
          <Section title={`Flags Raised (${run.flags_raised.length})`}>
            <div className="space-y-2.5">
              {run.flags_raised.map((flag: Flag, i: number) => (
                <div key={i} className="border border-slate-100 rounded-xl p-3.5">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        flag.flag_confidence === "high"
                          ? "bg-red-100 text-red-700"
                          : flag.flag_confidence === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {flag.flag_confidence}
                    </span>
                    <span className="text-sm font-medium text-slate-800">
                      {flag.category}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm text-slate-600">{flag.subcategory}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{flag.detail}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Pipeline stages */}
        <Section title="Pipeline Stages">
          <div className="space-y-2.5">
            {STAGE_DEFS.map((stage, i) => {
              const lines = stageGroups[stage.prefix] ?? [];
              return (
                <StageCard
                  key={i}
                  index={i + 1}
                  name={stage.name}
                  desc=""
                  status={lines.length > 0 ? "done" : "skipped"}
                  lines={lines}
                />
              );
            })}
          </div>
        </Section>

        {/* Extracted data */}
        <Section title="Extracted Data">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm mb-4">
            <Field label="Vendor" value={run.extracted_data.vendor_name} />
            <Field label="Invoice #" value={run.extracted_data.invoice_number} />
            <Field label="Date" value={run.extracted_data.invoice_date} />
            <Field
              label="Total"
              value={
                run.extracted_data.total != null
                  ? `$${run.extracted_data.total.toFixed(2)}`
                  : null
              }
            />
            <Field
              label="Subtotal"
              value={
                run.extracted_data.subtotal != null
                  ? `$${run.extracted_data.subtotal.toFixed(2)}`
                  : null
              }
            />
            <Field
              label="Tax"
              value={
                run.extracted_data.tax != null
                  ? `$${run.extracted_data.tax.toFixed(2)}`
                  : null
              }
            />
            <Field label="PO Reference" value={run.extracted_data.po_reference ?? "None"} />
          </dl>

          {run.extracted_data.line_items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                Line Items
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1.5 font-medium">Description</th>
                    <th className="text-right py-1.5 font-medium w-12">Qty</th>
                    <th className="text-right py-1.5 font-medium w-20">Unit price</th>
                    <th className="text-right py-1.5 font-medium w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {run.extracted_data.line_items.map((item: LineItem, i: number) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-700">{item.description}</td>
                      <td className="py-1.5 text-slate-600 text-right">{item.quantity}</td>
                      <td className="py-1.5 text-slate-600 text-right">
                        ${item.unit_price.toFixed(2)}
                      </td>
                      <td className="py-1.5 text-slate-700 font-medium text-right">
                        ${(item.quantity * item.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{value ?? "—"}</dd>
    </>
  );
}
