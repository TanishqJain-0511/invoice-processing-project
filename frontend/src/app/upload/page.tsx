"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Cpu,
  ShieldCheck,
  GitMerge,
  Scale,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SectionCard from "@/components/shared/SectionCard";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ── Pipeline stage definitions ─────────────────────────────── */
const STAGES = [
  {
    index: 1,
    name: "Extraction",
    desc: "PDF parsed · GPT-4o mini structured output",
    icon: Cpu,
    color: { ring: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", icon: "text-blue-500" },
  },
  {
    index: 2,
    name: "Validation",
    desc: "Required fields · internal math · date sanity",
    icon: ShieldCheck,
    color: { ring: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500", icon: "text-violet-500" },
  },
  {
    index: 3,
    name: "Matching",
    desc: "PO lookup · vendor check · tolerance · duplicates",
    icon: GitMerge,
    color: { ring: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", icon: "text-amber-500" },
  },
  {
    index: 4,
    name: "Decision",
    desc: "Final verdict · confidence · reasoning trail",
    icon: Scale,
    color: { ring: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", icon: "text-emerald-500" },
  },
];

type StageStatus = "pending" | "running" | "done" | "skipped";

/* ── Log messages keyed by time offset (ms) ─────────────────── */
const LOG_SEQUENCE = [
  { delay: 200, msg: "Received invoice PDF · initiating pipeline" },
  { delay: 600, msg: "pdfplumber: extracting text layer" },
  { delay: 1100, msg: "Calling GPT-4o mini for structured extraction" },
  { delay: 1800, msg: "Extraction complete · vendor, dates, amounts parsed" },
  { delay: 2300, msg: "Stage 2: validating required fields" },
  { delay: 2600, msg: "Internal math check: line items vs. total" },
  { delay: 2900, msg: "Date sanity check: invoice_date vs. reference_date" },
  { delay: 3200, msg: "Stage 3: searching PO database for match" },
  { delay: 3500, msg: "Checking approved vendor registry" },
  { delay: 3700, msg: "Computing tiered tolerance thresholds" },
  { delay: 4000, msg: "Scanning duplicate detection window (60 days)" },
  { delay: 4400, msg: "Stage 4: applying business rules" },
  { delay: 4900, msg: "Generating final decision and reasoning trail..." },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Processing stage row ───────────────────────────────────── */
function StageRow({
  stage,
  status,
}: {
  stage: (typeof STAGES)[number];
  status: StageStatus;
}) {
  const Icon = stage.icon;
  const isDone = status === "done";
  const isRunning = status === "running";
  const isPending = status === "pending";

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border transition-all duration-300 ${
        isRunning
          ? `${stage.color.bg} ${stage.color.ring}`
          : isDone
          ? "bg-gray-50 border-gray-100"
          : "bg-white border-gray-100 opacity-50"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all ${
          isDone
            ? "bg-gray-100"
            : isRunning
            ? stage.color.bg
            : "bg-gray-100"
        }`}
      >
        {isDone ? (
          <CheckCircle className="w-5 h-5 text-gray-500" />
        ) : isRunning ? (
          <div className={`w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin ${stage.color.icon}`} />
        ) : (
          <span className="text-xs font-bold text-gray-400">{stage.index}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-medium ${
              isDone ? "text-gray-600" : isRunning ? stage.color.text : "text-gray-400"
            }`}
          >
            {stage.name}
          </p>
          {isRunning && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color.bg} ${stage.color.text}`}>
              Running
            </span>
          )}
          {isDone && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
              Done
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{stage.desc}</p>
      </div>

      {/* Progress dots for running */}
      {isRunning && (
        <div className="flex gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${stage.color.dot} animate-bounce`}
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [refDate, setRefDate] = useState("2026-06-25");
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stages, setStages] = useState<StageStatus[]>(["pending", "pending", "pending", "pending"]);
  const [logs, setLogs] = useState<{ t: string; msg: string }[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDateInfo, setShowDateInfo] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function pickFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setFile(f);
    setError(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(URL.createObjectURL(f));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  function startProcessingAnimation() {
    setStages(["running", "pending", "pending", "pending"]);
    setProgress(5);
    const seqTimers = [
      setTimeout(() => { setStages(["done", "running", "pending", "pending"]); setProgress(30); }, 2200),
      setTimeout(() => { setStages(["done", "done", "running", "pending"]); setProgress(60); }, 3100),
      setTimeout(() => { setStages(["done", "done", "done", "running"]); setProgress(85); }, 3900),
    ];
    const logTimers = LOG_SEQUENCE.map(({ delay, msg }) =>
      setTimeout(() => {
        const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLogs((prev) => [...prev, { t: now, msg }]);
      }, delay)
    );
    timers.current = [...seqTimers, ...logTimers];
  }

  async function submit() {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setLogs([]);

    startProcessingAnimation();

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("reference_date", refDate);

      const flagRules = localStorage.getItem("invoiceProcessor:flagRules");
      if (flagRules) form.append("flag_rules_json", flagRules);
      const poDataset = localStorage.getItem("invoiceProcessor:poDataset");
      if (poDataset) form.append("po_dataset_json", poDataset);
      const vendorList = localStorage.getItem("invoiceProcessor:vendorList");
      if (vendorList) form.append("vendor_list_json", vendorList);
      const invoiceHistory = localStorage.getItem("invoiceProcessor:invoiceHistory");
      if (invoiceHistory) form.append("invoice_history_json", invoiceHistory);

      const res = await fetch(`${API}/api/process`, { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Request failed");
        throw new Error(msg);
      }

      const data = await res.json();
      clearTimers();
      setStages(["done", "done", "done", "done"]);
      setProgress(100);
      setTimeout(() => router.push(`/runs/${data.run_id}`), 500);
    } catch (e) {
      clearTimers();
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setProcessing(false);
      setStages(["pending", "pending", "pending", "pending"]);
      setProgress(0);
    }
  }

  /* ── Processing view ─────────────────────────────────────── */
  if (processing) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <p className="text-xs text-gray-400 mb-0.5">Upload / Processing</p>
          <h1 className="text-xl font-semibold text-gray-900">Running AI Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {file?.name} · {file ? formatSize(file.size) : ""}
          </p>
        </div>

        <div className="grid grid-cols-5 gap-5">
          {/* Left — Pipeline + logs */}
          <div className="col-span-3 space-y-4">
            {/* Progress */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">Pipeline Progress</p>
                <p className="text-sm font-semibold text-gray-900">{progress}%</p>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
                <div
                  className="h-full bg-gray-900 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="space-y-2.5">
                {STAGES.map((stage, i) => (
                  <StageRow key={i} stage={stage} status={stages[i]} />
                ))}
              </div>
            </div>

            {/* Live logs */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Live Logs</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 animate-log-in">
                    <span className="text-gray-300 shrink-0 select-none">{log.t}</span>
                    <span className="text-gray-600">{log.msg}</span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <p className="text-gray-400 italic">Initializing pipeline...</p>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

          {/* Right — PDF preview */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 sticky top-6">
              <p className="text-sm font-semibold text-gray-900 mb-3">Invoice Preview</p>
              <div className="relative rounded-md border border-gray-100 overflow-hidden bg-gray-50" style={{ aspectRatio: "3/4" }}>
                {pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    title="Invoice preview"
                    className="w-full h-full"
                    style={{ border: "none" }}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <FileText className="w-12 h-12 text-gray-200 mb-3" />
                    <p className="text-xs text-gray-400 font-medium">{file?.name}</p>
                  </div>
                )}
                {/* Scanning overlay */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="animate-scan" />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                AI is reading and extracting data from this invoice
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Upload form view ────────────────────────────────────── */
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Upload Invoice"
        description="Upload a vendor invoice PDF to begin the AI validation pipeline."
        className="mb-6"
      />

      <div className="grid grid-cols-3 gap-5">
        {/* Main upload column */}
        <div className="col-span-2 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-all duration-150 select-none ${
              dragging
                ? "border-blue-400 bg-blue-50"
                : file
                ? "border-emerald-300 bg-emerald-50"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
            />

            {file ? (
              <div className="p-8 flex items-center gap-5">
                <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <FileText className="w-7 h-7 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatSize(file.size)} · PDF document</p>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">Ready to process</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setPdfUrl(null); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-12 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-4 transition-colors group-hover:bg-gray-200">
                  <Upload className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Drop your invoice here
                </p>
                <p className="text-xs text-gray-400 mb-3">or click to browse files</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-gray-300" />
                    PDF only
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-gray-300" />
                    Up to 50 MB
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-gray-300" />
                    Scanned invoices supported
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-900 mb-4">Processing Options</p>
            <div className="space-y-4">
              {/* Reference date */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-xs font-medium text-gray-700">Reference Date</label>
                    <button
                      type="button"
                      onClick={() => setShowDateInfo(!showDateInfo)}
                      className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 flex items-center justify-center transition-colors"
                      aria-label="What is the reference date?"
                    >
                      <Info className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <input
                    type="date"
                    value={refDate}
                    onChange={(e) => setRefDate(e.target.value)}
                    className="border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent w-full"
                  />
                  {showDateInfo && (
                    <div className="mt-2 bg-gray-900 text-white text-xs rounded-lg p-3 leading-relaxed">
                      <p className="font-semibold mb-1">What is the reference date?</p>
                      <p className="text-gray-300">
                        Used to evaluate the{" "}
                        <span className="text-white font-medium">60-day duplicate detection window</span>.
                        In production, defaults to today.
                      </p>
                      <p className="text-gray-400 mt-1.5 font-mono">
                        Use 2026-06-25 for the test invoices.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={!file}
            className="w-full bg-gray-900 text-white text-sm font-medium rounded-lg py-3 disabled:opacity-40 hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 flex items-center justify-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            Process Invoice
          </button>
        </div>

        {/* Right sidebar */}
        <div className="col-span-1 space-y-4">
          {/* Pipeline preview */}
          <SectionCard title="AI Pipeline">
            <div className="space-y-0">
              {STAGES.map((stage, i) => {
                const Icon = stage.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                      <div className={`w-7 h-7 rounded-lg ${stage.color.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${stage.color.icon}`} />
                      </div>
                      {i < 3 && <div className="w-px h-5 bg-gray-100 my-1" />}
                    </div>
                    <div className="pb-1 min-w-0">
                      <p className={`text-xs font-semibold ${stage.color.text}`}>{stage.name}</p>
                      <p className="text-[10px] text-gray-400 leading-relaxed mt-0.5">{stage.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
              Powered by GPT-4o mini · LangGraph StateGraph · ~10s total
            </p>
          </SectionCard>

          {/* Tips */}
          <SectionCard title="Tips">
            <ul className="space-y-2">
              {[
                "Use native PDF exports for best accuracy",
                "Scanned invoices must be clearly legible",
                "Include PO numbers on the invoice for faster matching",
                "Date format: YYYY-MM-DD works best",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* Sample invoice link */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-blue-800 mb-1">Demo Mode</p>
            <p className="text-[10px] text-blue-600 leading-relaxed mb-2">
              Use any of the test PDFs from the <code className="font-mono">test_data/</code> folder
              with reference date <span className="font-mono font-semibold">2026-06-25</span>.
            </p>
            <p className="text-[10px] text-blue-500">
              Try invoice_1_happy_path_INV-3001.pdf for an approve result.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
