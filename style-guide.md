## Style Guide: Annotated Instrument

### Brand Voice (Visual)

Vendor Observatory presents data the way a careful analyst would: directly, with appropriate context, without spin. The visual language should feel like a well-maintained instrument — precise, purposeful, and honest about what it doesn't know.

---

### Typography

**Data layer** — monospace, always

```
Font: JetBrains Mono (or IBM Plex Mono as fallback)
Weights used: Regular (400), Medium (500)
Use for: all numeric data values, percentages, counts, timestamps, corpus stats
Size scale:
  - Hero metric: 48px / 500
  - Primary stat: 24px / 500
  - Table value: 14px / 400
  - Label / n=: 12px / 400
```

**UI chrome layer** — humanist sans, neutral

```
Font: Geist Sans (or Inter as fallback)
Weights used: Regular (400), Medium (500), Semibold (600)
Use for: navigation, labels, filter controls, button text, body copy
Size scale:
  - Section header: 13px / 600 / uppercase / 0.08em tracking
  - Body / description: 14px / 400
  - UI label: 12px / 500
  - Small / footnote: 11px / 400
```

**Annotation layer** — same sans, distinct treatment

```
Font: Geist Sans
Weight: Regular (400)
Color: always muted (--text-muted, see palette)
Style: italic for inline callouts; regular for chart labels
Use for: chart annotations, methodology notes, finding-framed headers, n= callouts
Max width: 280px for annotation blocks (never full-width)
```

No serifs. Serifs were considered (Option C) but rejected for this build: the developer audience and the interactive/dark-mode context both push against it.

---

### Color Palette

**Dark mode (default)**

```
--bg-base:        #0d0d0f    /* near-black, not pure black */
--bg-surface:     #111114    /* card and panel backgrounds */
--bg-raised:      #18181c    /* elevated elements, dropdowns */
--border-subtle:  #222228    /* dividers, grid lines */
--border:         #2e2e38    /* card borders, input borders */

--text-primary:   #f0f0f4    /* primary labels, headings */
--text-secondary: #8a8a9a    /* secondary labels, axis text */
--text-muted:     #5a5a6e    /* annotations, n= labels, footnotes */

--accent:         #6366f1    /* indigo — single brand/interaction accent */
--accent-subtle:  #6366f120  /* 12% opacity; used for hover states, focus rings */

/* Data series — constrained 5-color scale */
--data-1:  #6366f1   /* indigo — primary series / focal vendor */
--data-2:  #22d3ee   /* cyan */
--data-3:  #f59e0b   /* amber */
--data-4:  #f43f5e   /* rose */
--data-5:  #a3e635   /* lime */
--data-muted: #3a3a4e /* inactive / below noise floor */

/* Signal vocabulary */
--signal-strong:  #6366f1   /* above category average */
--signal-noise:   #3a3a4e   /* at or below noise floor — sparse data */
--signal-absent:  #222228   /* no data / zero observations */
```

**Light mode**

```
--bg-base:        #fafafa
--bg-surface:     #ffffff
--bg-raised:      #f4f4f6
--border-subtle:  #e8e8ec
--border:         #d4d4dc

--text-primary:   #111114
--text-secondary: #5a5a6e
--text-muted:     #9090a4

/* Accent and data series: same hues, adjusted lightness/saturation for light bg */
--accent:         #4f46e5
--data-1:  #4f46e5
--data-2:  #0891b2
--data-3:  #d97706
--data-4:  #e11d48
--data-5:  #65a30d
--data-muted: #c4c4d4
```

---

### Spacing and Layout

```
Base unit: 4px
Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96

Page layout:
  - Max content width: 1280px
  - Side nav width: 220px (collapsible to 56px icon rail)
  - Main content padding: 32px horizontal, 24px top

Card system:
  - Padding: 24px
  - Border-radius: 6px (restrained — not the rounded-xl of typical SaaS)
  - Border: 1px --border
  - Background: --bg-surface

Grid lines on charts:
  - Color: --border-subtle
  - Stroke: 1px, no dash
  - Opacity: 0.6
  - Always shown — do not suppress in "clean" chart variants
```

---

### Chart Conventions

**Guiding rule:** charts are instruments. They show the shape of the data without flattening it.

```
Chart type defaults by use case:
  - Trend over time:        line chart (single trace) or area chart (multiple series, 40% opacity fill)
  - Category share:         horizontal bar chart (NOT pie or donut)
  - Funnel (rec→install→config): stepped bar or funnel bar — always show drop-off %
  - Distribution:           dot plot or strip chart preferred over histogram for small N
  - Comparison table:       data table with inline sparklines — not a bar chart

Axis conventions:
  - Y-axis: always starts at 0 for count/share data; never truncated to exaggerate deltas
  - X-axis labels: abbreviated dates (Jan '25) in --text-secondary / 12px Geist
  - Grid: horizontal lines only for line/bar; both axes for scatter
  - No axis border lines (spines) — grid lines carry the structure

Annotation conventions:
  - n= label: always shown near chart title, format: "n = 2,847 sessions · Jan–Feb 2026"
  - Noise floor: dashed horizontal line at minimum statistically meaningful threshold,
    labeled "noise floor" in --text-muted
  - Callout: small italic annotation in --text-muted, max 120 chars,
    connected to data point by a 1px line in --border
  - Finding header: precedes chart, format: "[Vendor] accounts for X% of [category] mentions"
    — factual, neutral, no superlatives

Data label format:
  - Percentages: one decimal place (14.3%, not 14% or 14.32%)
  - Counts: comma-separated integers (2,847)
  - Ratios: 2.1× format (not 2.1x or 210%)
  - Dates: always show year when data spans multiple years
```

---

### Component Patterns

**Stat card (KPI tile)**

```
Layout: icon (optional) + label + hero value + delta + context line

Label:        12px / Geist / 500 / uppercase / --text-secondary
Hero value:   32px / JetBrains Mono / 500 / --text-primary
Delta:        14px / Geist / 500 / color-coded (positive = --signal-strong; negative = --data-4)
              always show direction arrow + absolute change + % change
              e.g.  ↑ +3  (+27%)  vs. last 30 days
Context line: 12px / Geist / 400 / --text-muted
              e.g.  "n = 847 sessions · Feb 2026"

Card border:  1px --border
Background:   --bg-surface
```

**Data table**

```
Header row:   12px / Geist / 600 / uppercase / --text-secondary / 0.06em tracking
Body rows:    14px — labels in Geist 400, values in JetBrains Mono 400
Row height:   48px
Dividers:     1px --border-subtle (horizontal only)
Hover:        --bg-raised background on row
Zebra:        no — use dividers and hover instead

Inline sparkline: 80×24px, single line, --data-1 color, no axes, no labels
Rank badge:   16px circle, --bg-raised background, 11px / Geist / 600
```

**Annotation block (inline)**

```
Used for: methodology notes, n= caveats, finding context
Style: left border 2px --border in --data-muted color; padding-left 12px
Text: 13px / Geist / 400 / italic / --text-muted
Max-width: 480px
Spacing: 16px margin above and below
```

**Empty / zero-signal state**

```
Do not show an empty chart. Instead show:
  - A "quiet signal" state: the chart area renders with --signal-absent background,
    a noise-floor line, and a centered annotation:
    "No organic signal detected in this period.
     Category benchmark data is available below."
  - Below the quiet-signal chart: the category-level data renders normally,
    with the vendor's bar rendered in --signal-absent (not --data-1)
  - A secondary action: "Run a benchmark comparison →" links to the
    seeded benchmark flow
```

---

### Voice and Language

```
Findings header pattern:
  "[Vendor] appears in [X]% of [category] sessions — [Y]× the category average"
  "[Vendor] was not detected in organic sessions this period."
  "[Category] shows strong agent adoption; [Vendor] ranks [N] of [M] vendors."

Avoid:
  - "endorsement", "recommendation score", "approval" — use "mention", "signal", "detection"
  - Superlatives: "best", "top", "leading" — let the rank speak
  - Congratulatory framing: no "Great job!", no upward-trend celebrations
  - Jargon without context: "noise floor" is fine if followed by "(fewer than N sessions)"

Timestamps:
  - Always: "Updated March 1, 2026 · 2,847 sessions analyzed"
  - Never omit the session count from any data view
```

---

### Interaction Principles

- **Hover reveals, click drills**: hover states surface the n= and raw count behind a percentage; click navigates to a detailed breakdown view
- **Filters are persistent and visible**: active filters always shown as dismissible chips near the top of the view; never hidden in a collapsed sidebar
- **Loading states**: skeleton screens that match the final layout shape, never spinners alone
- **No animations on data**: charts render without entrance animations — data is not entertainment. Micro-animations are acceptable for UI state (drawer open, filter chip dismiss)
- **Keyboard navigable**: all filter controls and chart interactions reachable via keyboard; focus rings use --accent-subtle at 2px offset
