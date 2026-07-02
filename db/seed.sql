-- Invoice Processing Pipeline — Seed Data
-- Run AFTER schema.sql. Paste into the Supabase SQL editor.
-- Populates purchase_orders, approved_vendors, and invoice_history
-- from the test_data/ reference files (phase_2.md).

-- ── Purchase Orders ───────────────────────────────────────────────────────────

INSERT INTO purchase_orders (po_number, vendor_name, line_items, subtotal, tax, po_total, status, date_issued) VALUES
(
    'PO-1001',
    'Meridian Office Supplies',
    '[{"description": "Office Chair - Ergonomic, Adjustable Lumbar Support", "quantity": 50, "unit_price": 80.00}]',
    4000.00, 200.00, 4200.00, 'open', '2026-06-05'
),
(
    'PO-1002',
    'TBD - Edge A (scanned invoice sample)',
    '[]',
    NULL, NULL, NULL, 'open', NULL
),
(
    'PO-1003',
    'Coastal Print & Design',
    '[{"description": "Custom Brochure Print - Tri-fold, Full Color, Gloss Finish", "quantity": 200, "unit_price": 12.50}]',
    2500.00, 150.00, 2650.00, 'open', '2026-06-01'
),
(
    'PO-1004',
    'Harbor Logistics Parts',
    '[{"description": "Hydraulic Pump Unit - Model HP-220, Industrial Grade", "quantity": 10, "unit_price": 1250.00}]',
    12500.00, 0.00, 12500.00, 'open', '2026-06-10'
),
(
    'PO-1005',
    'Silverline Manufacturing',
    '[{"description": "Steel Bracket - Heavy Duty, Galvanized, 6in", "quantity": 40, "unit_price": 50.00}]',
    2000.00, 0.00, 2000.00, 'open', '2026-06-08'
),
(
    'PO-1007',
    'Global Parts Co.',
    '[{"description": "Conveyor Roller - Steel, 4in Diameter, Sealed Bearing", "quantity": 30, "unit_price": 115.00}]',
    3450.00, 0.00, 3450.00, 'open', '2026-05-10'
)
ON CONFLICT (po_number) DO NOTHING;

-- ── Approved Vendors ──────────────────────────────────────────────────────────

INSERT INTO approved_vendors (vendor_name, approved) VALUES
('Meridian Office Supplies',            TRUE),
('Coastal Print & Design',              TRUE),
('Harbor Logistics Parts',              TRUE),
('Silverline Manufacturing',            TRUE),
('Global Parts Co.',                    TRUE),
('TBD - Edge A (scanned invoice sample)', TRUE)
ON CONFLICT (vendor_name) DO NOTHING;

-- ── Invoice History (duplicate-detection seed) ────────────────────────────────

INSERT INTO invoice_history (vendor_name, invoice_number, amount, invoice_date, processed_date) VALUES
('Global Parts Co.', 'INV-7788', 3450.00, '2026-05-15', '2026-05-16');
