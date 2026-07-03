"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Building2, Image, Globe, Mail, MapPin, User, Shield, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import SectionCard from "@/components/shared/SectionCard";
import { getUser, logout } from "@/lib/auth";

const STORAGE_KEY = "invoiceProcessor:companyInfo";

interface CompanyInfo {
  name: string;
  address: string;
  email: string;
  logoUrl: string;
}

const EMPTY: CompanyInfo = { name: "", address: "", email: "", logoUrl: "" };

const TABS = ["Organization", "Workspace"] as const;
type Tab = (typeof TABS)[number];

function InputField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1">
        <label className="text-xs font-medium text-gray-700">{label}</label>
        {required && <span className="text-red-500 text-xs">*</span>}
        {hint && <span className="text-xs text-gray-400 ml-1">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Organization");
  const [form, setForm] = useState<CompanyInfo>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const user = getUser();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setForm(JSON.parse(stored));
    } catch {}
  }, []);

  function set(field: keyof CompanyInfo, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setError(null);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave() {
    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    setSaved(true);
    window.dispatchEvent(new Event("storage"));
    showToast("Company information saved");
  }

  function handleClear() {
    setForm(EMPTY);
    localStorage.removeItem(STORAGE_KEY);
    setSaved(false);
    window.dispatchEvent(new Event("storage"));
    showToast("Company information cleared");
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const invoiceCount = (() => {
    try {
      const ih = localStorage.getItem("invoiceProcessor:invoiceHistory");
      return ih ? JSON.parse(ih).length : 0;
    } catch { return 0; }
  })();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg animate-slide-down">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}

      <PageHeader
        title="Admin"
        description="Manage workspace configuration and company information."
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Organization tab ─────────────────────────────── */}
      {tab === "Organization" && (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <SectionCard title="Company Details" description="Displayed in the sidebar and app header.">
            <div className="space-y-4">
              <InputField label="Company Name" required>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Acme Corp"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </InputField>

              <InputField label="Address">
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <textarea
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder={"123 Main St\nSan Francisco, CA 94105"}
                    rows={3}
                    className={`${inputClass} pl-9 resize-none`}
                  />
                </div>
              </InputField>

              <InputField label="Support Email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="ap@acmecorp.com"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </InputField>
            </div>
          </SectionCard>

          <SectionCard title="Branding" description="Logo shown in the sidebar when a URL is provided.">
            <div className="space-y-4">
              <InputField label="Logo URL" hint="— optional">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={form.logoUrl}
                    onChange={(e) => set("logoUrl", e.target.value)}
                    placeholder="https://company.com/logo.png"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </InputField>

              {form.logoUrl && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <Image className="w-4 h-4 text-gray-400" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.logoUrl}
                    alt="Logo preview"
                    className="h-8 w-auto object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs text-gray-500">Logo preview</span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="bg-gray-900 text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              Save changes
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <CheckCircle className="w-4 h-4" />
                Saved
              </span>
            )}
            {form.name && (
              <button
                onClick={handleClear}
                className="text-sm text-red-500 hover:text-red-700 transition-colors ml-auto"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Preview */}
          {(form.name || form.address || form.email) && (
            <SectionCard title="Preview">
              <div className="space-y-1 text-sm">
                {form.name && <p className="font-semibold text-gray-900">{form.name}</p>}
                {form.address && (
                  <p className="text-gray-500 whitespace-pre-line text-xs">{form.address}</p>
                )}
                {form.email && (
                  <a href={`mailto:${form.email}`} className="text-xs text-blue-600 hover:underline">
                    {form.email}
                  </a>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Workspace tab ─────────────────────────────────── */}
      {tab === "Workspace" && (
        <div className="space-y-4">
          <SectionCard title="Workspace Info">
            <div className="grid grid-cols-2 gap-6">
              {[
                { label: "Pipeline Version", value: "PS-1 (Phase 1)" },
                { label: "Invoice Engine", value: "LangGraph StateGraph" },
                { label: "AI Model", value: "GPT-4o mini (dev)" },
                { label: "Invoice History", value: `${invoiceCount} record${invoiceCount !== 1 ? "s" : ""}` },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-gray-400 font-medium">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Current Session" description="Your active workspace session.">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-gray-700">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Administrator · InvoiceIQ workspace</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Not signed in</p>
            )}
          </SectionCard>

          <SectionCard title="Security">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Authentication: Mock session (demo mode)</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Role: Administrator</span>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100 mt-4">
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out of workspace
              </button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
