const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface ExtractedData {
  vendor_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  po_reference: string | null;
}

export interface Flag {
  category: string;
  subcategory: string;
  flag_confidence: "high" | "medium" | "low";
  detail: string;
}

export interface RunDetail {
  id: string;
  created_at: string;
  invoice_filename: string | null;
  invoice_file_url: string | null;
  decision: "approve" | "flag" | "reject";
  decision_confidence: "high" | "medium" | "low";
  extraction_confidence: "high" | "medium" | "low";
  reasoning_trail: string[];
  extracted_data: ExtractedData;
  matched_po: string | null;
  flags_raised: Flag[];
}

export interface RunSummary {
  id: string;
  created_at: string;
  invoice_filename: string | null;
  decision: "approve" | "flag" | "reject";
  decision_confidence: "high" | "medium" | "low" | null;
  extraction_confidence: "high" | "medium" | "low" | null;
  matched_po: string | null;
  flags_count: number;
  flag_categories: string[];
  flags_raised: Flag[];
}

export async function getRun(id: string): Promise<RunDetail> {
  const res = await fetch(`${API}/api/runs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Run ${id} not found`);
  return res.json();
}

export async function getRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${API}/api/runs`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch runs");
  return res.json();
}
