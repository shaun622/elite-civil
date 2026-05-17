# TakeoffMate — Claude Code Build Brief

## Context

You are building **TakeoffMate**, a SaaS web app that extracts measurements from architectural drawings (PDFs) using Claude's vision API. Initial vertical: retaining walls. The app will expand to fencing, decking, and slabs later.

Target users: retaining wall installers, fencing contractors, landscapers, small builders, and building designers in Australia and New Zealand.

Value prop: "Upload a drawing, get accurate measurements in 30 seconds, with a visual audit trail showing exactly what the AI read."

This is part of the MateHQ portfolio (matehq.online) and follows the established stack: React/Vite + Tailwind + Supabase + Resend + Railway + Stripe.

## Build Philosophy

- Ship a working MVP, not a polished v1. Skip nice-to-haves and focus on the core loop: upload → extract → review → export.
- Linear-aesthetic design. Clean, minimal, fast.
- Mobile-friendly but desktop-first (this is a workshop/office tool).
- Every AI output is human-reviewable. No silent acceptance of values.
- Audit trail is core to the product, not an extra. Every measurement must be traceable to a visible label on the original drawing.

## Tech Stack

- **Frontend**: React + Vite + Tailwind, PWA-enabled, shadcn/ui components
- **Backend**: Supabase (auth, Postgres, Storage, Edge Functions)
- **AI**: Anthropic API — extraction uses `claude-opus-4-7`. (The brief originally specced Sonnet for cost, but Opus 4.7's high-resolution vision is needed for accurate annotation-overlay coordinates on large site plans — accepted cost increase, decided 2026-05-17. Do not silently revert to Sonnet.)
- **PDF rendering**: pdf.js on client for preview + rasterization to PNG
- **Overlay rendering**: react-konva for interactive annotation layer
- **Payments**: Stripe (subscription + 3-drawing free trial, no card required)
- **Email**: Resend (welcome, receipts, drawing-ready notifications)
- **Hosting**: Railway (frontend) + Supabase managed backend
- **Domain**: takeoffmate.com (assume available, fall back to matehq.online/takeoff)

## MVP Scope (Phase 1 — what to build now)

1. Auth (email + password via Supabase Auth, magic link as fallback)
2. Project workspace with project list and detail views
3. PDF upload + client-side rasterization to PNG (200 DPI)
4. AI extraction via Edge Function calling Anthropic API
5. Interactive review screen with annotated drawing + editable table
6. CSV + branded PDF export (PDF includes annotated overlay as audit trail)
7. Stripe subscription with usage metering
8. Settings (profile, company branding for PDF exports, billing)

## Out of Scope for v1

- DXF/DWG parsing (Phase 2)
- Built-in calculators (user already has these elsewhere)
- Multi-user teams
- Batch upload
- Mobile camera capture
- Quote/invoice integration

## Data Model (Supabase)

```sql
-- users managed by Supabase Auth
-- public.profiles extends auth.users
profiles
  id (uuid, refs auth.users)
  email
  company_name
  company_logo_url       -- for branded PDF exports
  company_address
  created_at
  updated_at

subscriptions
  id
  user_id (refs profiles)
  stripe_customer_id
  stripe_subscription_id
  plan                   -- 'trial' | 'starter' | 'pro'
  status                 -- 'active' | 'cancelled' | 'past_due' | 'trial'
  current_period_start
  current_period_end
  drawings_used_this_period
  drawings_limit         -- nullable for unlimited
  created_at

projects
  id
  user_id (refs profiles)
  name
  site_address
  client_name
  status                 -- 'draft' | 'active' | 'archived'
  notes
  created_at
  updated_at

drawings
  id
  project_id (refs projects)
  original_filename
  file_url               -- Supabase Storage path to original PDF
  page_count
  created_at

drawing_pages
  id
  drawing_id (refs drawings)
  page_number
  image_url              -- Supabase Storage path to rasterized PNG
  image_width            -- pixel dimensions of rasterized PNG
  image_height
  view_type              -- 'plan' | 'elevation' | 'section' | 'unknown'
  extraction_status      -- 'pending' | 'extracting' | 'extracted' | 'reviewed' | 'failed'
  extraction_error
  created_at

extractions
  id
  drawing_page_id (refs drawing_pages, unique)
  raw_response (jsonb)   -- full Claude response for debugging
  scale_text             -- e.g. "1:100"
  units                  -- 'mm' | 'm' | 'ft' | 'in'
  view_type              -- AI-detected
  overall_confidence     -- 0.0 - 1.0
  warnings (jsonb)       -- array of strings
  reviewed (boolean)
  reviewed_at
  reviewed_by (refs profiles)
  created_at

dimension_labels
  id
  extraction_id (refs extractions)
  text_raw               -- "2400", "1.8m H"
  value_normalized       -- 2400 (always in mm)
  bbox (jsonb)           -- [x1, y1, x2, y2] normalized 0-1000
  confidence             -- 0.0 - 1.0
  applies_to_segment_id  -- nullable, refs wall_segments

wall_segments
  id
  extraction_id (refs extractions)
  label                  -- "Wall A", "RW-01"
  length_mm
  height_mm
  thickness_mm           -- nullable
  polyline (jsonb)       -- array of [x,y] points, normalized 0-1000
  label_bbox (jsonb)     -- [x1, y1, x2, y2]
  source_dimension_ids (jsonb) -- array of dimension_label ids
  confidence
  notes
  user_edited (boolean)
  original_values (jsonb) -- snapshot before edit, for audit
  user_added (boolean)   -- true if human added (not AI-extracted)
  created_at
  updated_at

exports
  id
  project_id (refs projects)
  format                 -- 'csv' | 'pdf'
  file_url
  drawing_page_ids (jsonb) -- which pages included
  created_at
```

## Edge Functions

### `extract-drawing`

```
POST /functions/v1/extract-drawing
Body: { drawing_page_id: string }

Flow:
  1. Auth check — user owns the project
  2. Check subscription has quota remaining; deduct 1
  3. Update drawing_pages.extraction_status = 'extracting'
  4. Load PNG from Supabase Storage as base64
  5. Call Anthropic /v1/messages with system prompt (see below)
     - model: claude-sonnet-4-5 (latest)
     - max_tokens: 4096
     - temperature: 0.0
     - Image as content block, instructions as text
  6. Parse JSON response, validate against schema (zod)
  7. Insert extractions + dimension_labels + wall_segments
  8. Update drawing_pages.extraction_status = 'extracted'
  9. Return full extraction payload to client
On error:
  - Roll back quota deduction
  - Set extraction_status = 'failed' with error message
  - Return error to client with retry guidance
```

### `stripe-webhook`

Handle: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Sync to `subscriptions` table. Reset `drawings_used_this_period` on each `invoice.payment_succeeded`.

### `generate-pdf-export`

Server-side PDF generation (use `pdf-lib` or `@react-pdf/renderer`). Two-section PDF:
1. **Cover + measurement table**: project info, client name, site address, date, branded header, table of all wall segments with length/height/thickness/notes.
2. **Audit trail**: each drawing page rendered with annotation overlay baked in (use Sharp or Canvas server-side to composite overlay onto PNG, then embed in PDF). Footer: "Measurements extracted by AI and reviewed by user. Verify against original drawings."

### `generate-csv-export`

Simple. Columns: `wall_label, length_mm, height_mm, thickness_mm, notes, source, confidence, user_edited`.

## Extraction System Prompt

This is the most important code in the app. Use it verbatim in the Edge Function. Iterate on it with real drawings before launch.

```
You are an expert quantity surveyor analyzing architectural drawings to extract retaining wall measurements. You must return ONLY valid JSON matching the schema below — no markdown, no commentary, no code fences.

The user has provided a rasterized image of an architectural drawing page. Image dimensions are W={image_width} x H={image_height} pixels.

Your job:

1. Identify the view type (plan, elevation, section, or unknown).
2. Find the drawing scale from the title block, scale bar, or scale notation. Return the raw text exactly as printed.
3. Identify the units used on the drawing (millimetres, metres, feet, inches).
4. Find every dimension label visible on the drawing. A dimension label is a number (with or without unit suffix) that indicates a measurement. Examples: "2400", "2400mm", "1.8m", "1800 H".
5. Identify each distinct retaining wall segment. Return ONE wall_segment per distinct physical wall run on the drawing — NOT one per wall type. On site/layout plans showing many short walls (e.g. lot-boundary walls in a subdivision), it is correct to return 20, 30, or more segments. Type/colour information from the legend (e.g. "Type 1 Orange") belongs in the wall's `label` or `notes` field — never use it as a grouping mechanism.
6. For each wall segment, determine length, height, and thickness using this tiered policy:
   - If an explicit dimension label is present for the value, use it (confidence 0.85–1.0).
   - Otherwise, if a scale bar or scale notation is visible, you MAY scale the value off the drawing. Set confidence 0.35–0.6 and add a per-segment warning naming the wall and the scale used. Put a short note in the segment's `notes` field.
   - If neither is available, leave the value null.

Coordinate system:
- Return all bounding boxes as [x1, y1, x2, y2] in normalized coordinates from 0 to 1000, where (0,0) is top-left and (1000,1000) is bottom-right.
- Return polylines as arrays of [x, y] points in the same normalized 0-1000 coordinate space.
- Be precise — these coordinates will be used to draw overlay graphics on the original image.

Confidence scoring:
- 0.9-1.0: clearly labeled, unambiguous
- 0.7-0.9: labeled but some interpretation required
- 0.5-0.7: inferred from context, requires human review
- Below 0.5: do not include; add to warnings instead

Output this exact JSON schema:

{
  "view_type": "plan" | "elevation" | "section" | "unknown",
  "scale_text": string | null,
  "scale_bbox": [x1, y1, x2, y2] | null,
  "units": "mm" | "m" | "ft" | "in" | "unknown",
  "overall_confidence": number,
  "dimension_labels": [
    {
      "id": "dim_1",
      "text_raw": "2400",
      "value_normalized_mm": 2400,
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.95
    }
  ],
  "wall_segments": [
    {
      "id": "seg_1",
      "label": "Wall A",
      "length_mm": 2400,
      "height_mm": 1800,
      "thickness_mm": null,
      "polyline": [[x1,y1], [x2,y2]],
      "label_bbox": [x1, y1, x2, y2] | null,
      "source_dimension_ids": ["dim_1", "dim_2"],
      "confidence": 0.92,
      "notes": "Stepped foundation noted on drawing"
    }
  ],
  "warnings": [
    "Wall B height ambiguous — two dimensions overlap near grid line C",
    "Scale bar not found; relied on title block notation"
  ]
}

Critical rules:
- Return ONLY the JSON object. No prose before or after.
- Use null, not omission, for missing values.
- Always normalize values to millimetres in value_normalized_mm and length_mm / height_mm / thickness_mm fields. If drawing is in metres, multiply by 1000. If in feet/inches, convert to mm.
- Keep text_raw exactly as it appears on the drawing.
- One wall_segment per distinct physical wall run, never grouped by type/colour.
- source_dimension_ids should only include dim IDs whose label was used to derive this segment's measurements. For scaled measurements there will be no source dim, and the array may be empty.
- For every scaled measurement, add a warning naming the wall and the scale used.
- If you cannot find any retaining walls on this drawing, return wall_segments: [] and add an explanation to warnings.
- If the image quality prevents reliable extraction, return overall_confidence below 0.5 and explain in warnings.
```

## Screens

### `/login` and `/signup`
Supabase Auth UI, branded. Magic link option. Redirect to `/dashboard` on success.

### `/dashboard`
Header with logo, user menu (settings, billing, logout).
Quota indicator: "12 of 30 drawings used this month" with progress bar.
Project list (card grid):
- Project name, client, site address, last updated, drawing count
- Status badge
- Click → `/projects/:id`
"New Project" button → modal to create project (name, client, address).

### `/projects/:id`
Breadcrumb back to dashboard.
Project header (name, client, address, edit/archive actions).
Upload zone: drag-drop PDF or click to browse. Show progress for upload + rasterization.
After upload: list each page as a card with thumbnail, view type, extraction status, and "Review" button.
"Export Project" button → opens export modal with format choice (CSV / PDF) and page selection.

### `/projects/:id/pages/:pageId`
The review screen. The most important screen in the app.

Two-pane layout (desktop):
- **Left pane (60% width)**: Drawing viewer with annotation overlay.
  - PNG of drawing page as base layer.
  - react-konva overlay layer on top.
  - Zoom controls (+/-/fit/100%), pan with click-drag.
  - Layer toggles (top-right corner): Dimensions (green), Walls (blue), Scale source (yellow), Warnings (red, pulsing). Show provenance links (lines).
  - Hover a box → highlights matching table row. Click → scrolls table to row.
- **Right pane (40% width)**: Editable measurement table.
  - Top: scale, units, view type, overall confidence (with colour indicator).
  - Warnings panel (collapsible) — every warning from extraction.
  - Wall segments table: label, length, height, thickness, notes. All fields editable inline. Edit triggers `user_edited = true` and saves original_values snapshot.
  - "+ Add Wall Segment" button → manually add a segment Claude missed (creates with `user_added = true`).
  - Each row has a delete button.
  - Per-row confidence indicator (green/amber/red dot).
  - Sticky footer: "Confirm & Lock Review" button — marks extraction.reviewed = true.

Mobile: single pane with tab switcher (Drawing / Measurements).

### `/projects/:id/export`
Modal or page.
Format selection: CSV or Branded PDF.
Page selection: which drawing pages to include (default: all reviewed).
Preview thumbnail of cover page (for PDF).
Generate button → calls edge function → download link appears when ready.
Export history list below.

### `/settings`
Tabs: Profile, Company, Billing.
- Profile: name, email, password change.
- Company: company name, logo upload, address — used in PDF branding.
- Billing: current plan, drawings used this period, upgrade/downgrade, payment method (Stripe billing portal link), invoice history.

### `/pricing` (public)
Three tiers. Big CTAs. AU/NZ-targeted copy. SEO-optimized headers.

## Pricing (initial — adjustable)

| Plan | Price | Drawings/mo | Features |
|------|-------|-------------|----------|
| Trial | Free | 3 lifetime | All features, no card required |
| Starter | AUD $39/mo | 30 | CSV + PDF export, branding |
| Pro | AUD $89/mo | Unlimited | Everything + priority extraction queue + API access (Phase 2) |

Annual: 20% off. Stripe handles all billing.

Webhook reset of `drawings_used_this_period` on each successful invoice.

## Critical UX Rules

1. Every AI-extracted value is editable before lock-in. No silent acceptance.
2. Confidence score visible per drawing page AND per measurement row.
3. Original drawing displayed alongside extracted data at all times during review.
4. Warnings panel surfaces every ambiguity from extraction; cannot be hidden, only collapsed.
5. PDF export footer disclaimer (every page): "Measurements extracted by AI and reviewed by user on [date]. Verify against original drawings before quoting or construction."
6. User-edited and user-added measurements are visually distinct in the UI (purple highlight) and labeled in exports.
7. Extraction can be re-run on a page (e.g., if first pass was poor). Old extraction archived for audit, not deleted.

## File Structure

```
/src
  /components
    /ui                    -- shadcn primitives
    /auth
    /layout                -- Header, Sidebar, mobile nav
    /upload                -- Dropzone, PDF preview, progress
    /viewer                -- DrawingViewer (canvas + konva overlay)
    /annotation            -- Bounding box renderers, layer toggles
    /review                -- MeasurementTable, WarningsPanel
    /export                -- ExportModal, format pickers
    /billing               -- Plan cards, usage meter
  /pages
    LoginPage.tsx
    SignupPage.tsx
    DashboardPage.tsx
    ProjectPage.tsx
    ReviewPage.tsx
    ExportPage.tsx
    SettingsPage.tsx
    PricingPage.tsx
  /lib
    supabase.ts
    anthropic.ts            -- client-side helpers, NOT the API call
    stripe.ts
    pdfRender.ts            -- pdf.js wrapper for rasterization
    extractionSchema.ts     -- zod schema matching system prompt output
    coordTransform.ts       -- normalized 0-1000 ↔ pixel conversions
  /hooks
    useSupabase.ts
    useSubscription.ts
    useDrawingPage.ts
  /types
/supabase
  /functions
    /extract-drawing
    /stripe-webhook
    /generate-pdf-export
    /generate-csv-export
  /migrations
/public
```

## Implementation Order

Work in this order. Each step should be testable before moving to the next.

1. **Foundation**: Vite + React + Tailwind + Supabase project setup, auth flow, basic routing, profiles table.
2. **Projects CRUD**: dashboard, create/edit project, project detail page (no uploads yet).
3. **Upload + rasterization**: PDF upload to Supabase Storage, client-side rasterize to PNG at 200 DPI, save each page as `drawing_pages` row, render thumbnails.
4. **Extraction edge function**: implement extract-drawing function with the system prompt, hit it from the UI, store results. Test with 5-10 real drawings before moving on.
5. **Review screen v1**: drawing viewer (no annotation overlay yet), measurement table with inline editing, confirm/lock action.
6. **Annotation overlay**: react-konva integration, bounding box rendering, layer toggles, hover/click sync with table.
7. **CSV export**: trivial, ship it.
8. **PDF export**: branded cover, measurement table, annotated drawing pages as audit trail.
9. **Stripe + quota**: subscription flow, webhook, usage metering, paywall gates.
10. **Polish**: empty states, error states, loading states, mobile responsiveness, transactional emails via Resend.
11. **Settings**: profile, company branding, billing portal.

## Testing Strategy

- Create `/test-drawings` directory with 10-15 sample architectural drawings spanning easy (clear CAD output) to hard (scanned, hand-annotated, multi-view).
- Build a `/dev/extraction-test` admin page where you can upload a drawing, see Claude's raw response, the parsed output, and the annotation overlay side-by-side. Use this constantly during prompt iteration.
- Track extraction accuracy: post-review correction rate per drawing. Goal: < 15% of measurements need user correction.

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=

# Edge functions (set in Supabase dashboard)
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Design Notes

- Linear-inspired aesthetic: clean sans-serif (Inter), monochrome with one accent (deep blue or teal), generous whitespace, subtle borders not heavy shadows.
- Annotation colours fixed: dimensions = `#10b981` (green), walls = `#3b82f6` (blue), scale = `#eab308` (yellow), warnings = `#ef4444` (red, animated pulse), user-edited = `#a855f7` (purple).
- Drawing viewer uses dark grey background (`#1f2937`) to make white drawings pop.
- Use shadcn/ui for all form components and dialogs.
- Mobile: single-column, tab navigation between drawing and table on review screen.

## Success Metrics (track from day one)

- Time from upload to confirmed takeoff: target < 2 minutes
- Extraction accuracy (user correction rate): target < 15%
- Free → paid conversion: target 5%+
- Monthly churn: target < 5%
- Drawings processed per active user per month: target 8+

## Phase 2 Backlog (DO NOT BUILD YET)

- DXF/DWG parsing via ezdxf (Python edge function)
- Fencing takeoff (post counts, panel lengths, gates)
- Decking takeoff (joists, boards, fixings)
- Slab takeoff (area, perimeter, thickness)
- Team accounts and shared projects
- Mobile camera capture for site-printed plans
- API for third-party integrations
- Connector to QuoteMate for one-click quote generation
- Multi-language drawing support (Indonesian, Spanish)

---

## Before You Start

1. Confirm `claude-sonnet-4-5` is the correct latest model string from the Anthropic SDK; use the latest available if not.
2. Set up Supabase project, get URL + keys, enable Storage with a `drawings` bucket (private, signed URLs only).
3. Set up Stripe test mode, create products for Starter and Pro tiers.
4. Provision a Resend domain.
5. Stub the `test-drawings` directory with 3-5 sample PDFs Shaun will provide for prompt iteration.

Start with step 1 of the Implementation Order. Confirm each milestone with a working demo before moving on. Use Sonnet for bulk building, escalate to Opus for architecture decisions or tricky extraction prompt tuning.
