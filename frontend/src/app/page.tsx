"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import StageCard, { StageStatus } from "@/components/StageCard";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STAGES = [
  { name: "Extraction", desc: "Reading PDF · GPT-4o mini structured output" },
  { name: "Validation", desc: "Required fields · internal math · date sanity" },
  { name: "Matching", desc: "PO lookup · vendor check · tolerance · duplicates" },
  { name: "Decision", desc: "Synthesizing final verdict and confidence" },
];

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [refDate, setRefDate] = useState("2026-06-25");
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stages, setStages] = useState<StageStatus[]>(["pending", "pending", "pending", "pending"]);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setFile(f);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  // Animate stages while the API call is in flight
  useEffect(() => {
    if (!processing) return;

    setStages(["running", "pending", "pending", "pending"]);

    const t1 = setTimeout(() => setStages(["done", "running", "pending", "pending"]), 2200);
    const t2 = setTimeout(() => setStages(["done", "done", "running", "pending"]), 3100);
    const t3 = setTimeout(() => setStages(["done", "done", "done", "running"]), 3900);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [processing]);

  const submit = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("reference_date", refDate);

      const res = await fetch(`${API}/api/process`, { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Request failed");
        throw new Error(msg);
      }

      const data = await res.json();
      setStages(["done", "done", "done", "done"]);

      // Brief pause so user sees all stages complete before navigating
      setTimeout(() => router.push(`/runs/${data.run_id}`), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setProcessing(false);
      setStages(["pending", "pending", "pending", "pending"]);
    }
  };

  return (
    <main className="min-h-[calc(100vh-3rem)] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-sm text-slate-500">
            Upload an invoice PDF to get an instant decision with full reasoning.
          </p>
        </div>

        {!processing ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors select-none ${
                dragging
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                }}
              />
              {file ? (
                <div>
                  <p className="text-sm font-medium text-slate-800">✓ {file.name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(file.size / 1024).toFixed(0)} KB · click to change
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    Drop your invoice PDF here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                </div>
              )}
            </div>

            {/* Reference date */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-500 w-28 shrink-0">
                Reference date
              </label>
              <input
                type="date"
                value={refDate}
                onChange={(e) => setRefDate(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!file}
              className="w-full bg-slate-900 text-white text-sm font-medium rounded-xl py-2.5 disabled:opacity-40 hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              Process Invoice
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="mb-5">
              <p className="text-sm font-semibold text-slate-800">Processing</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{file?.name}</p>
            </div>
            <div className="space-y-2.5">
              {STAGES.map((stage, i) => (
                <StageCard
                  key={i}
                  index={i + 1}
                  name={stage.name}
                  desc={stage.desc}
                  status={stages[i]}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center mt-5">
              Running pipeline · this takes ~10s
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
