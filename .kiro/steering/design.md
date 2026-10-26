---
inclusion: manual
---

# Design tokens

Visual system for the InspectPath dashboard. These are the single source of
truth for color, type, spacing, and radius. Implemented as CSS variables in
`web/src/styles.css` (`:root`) and used everywhere instead of hardcoded values.

Design intent: a precise engineering tool for bridge inspectors and engineers.
Neutral cool base, color reserved for meaning, never color alone.

## Palette

### Base (neutral, cool)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f7f8fa` | off-white page background (cool, not cream) |
| `--surface` | `#ffffff` | raised surface, used sparingly |
| `--text` | `#1e293b` | dark slate, primary text; also the focus ring |
| `--text-muted` | `#5b6676` | secondary text and labels |
| `--border` | `#d8dde3` | thin gray divider |
| `--border-strong` | `#b9c0c9` | emphasis divider |

### Alert levels (meaning only)
Each level always carries a text label and an icon, never color alone.

| Token | Hex | Level |
|---|---|---|
| `--normal` | `#2e7d32` | Normal (green) |
| `--watch` | `#806500` | Watch (deep yellow; AA for white text and text-on-bg) |
| `--warning` | `#9e5200` | Warning (deep amber; AA) |
| `--alarm` | `#c62828` | Alarm (red) |

All four pass WCAG AA (>=4.5:1) both as a badge fill with white text and as
text on the off-white background. See the contrast table in the PR notes.

Soft band tints for the residual chart (level color at low alpha):
| Token | Hex |
|---|---|
| `--normal-band` | `#2e7d3214` |
| `--watch-band` | `#80650022` |
| `--warning-band` | `#9e520022` |
| `--alarm-band` | `#c6282822` |

### Finding tiers (reuse alert hues; always with a letter H/M/L too)
| Token | Hex | Tier |
|---|---|---|
| `--tier-high` | `#c62828` | high (red) |
| `--tier-medium` | `#9e5200` | medium (amber) |
| `--tier-low` | `#806500` | low (yellow) |

### Route and robot (the one purple; nothing else saturated)
| Token | Hex | Use |
|---|---|---|
| `--route` | `#6d28d9` | route line and robot marker |
| `--route-soft` | `#6d28d91f` | coverage shading (subtle) |

## Typography

One sans-serif family. Tabular numerals on all readings and numeric values.
Sentence case everywhere. No all-caps labels.

| Token | Value | Use |
|---|---|---|
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | all text |
| `--text-hero` | `3rem` / 700 | monitor alert level (the hero) |
| `--text-page` | `1.5rem` / 600 | page / view title |
| `--text-section` | `1.05rem` / 600 | section title |
| `--text-body` | `0.95rem` / 400 | body text |
| `--text-label` | `0.8rem` / 500 | small label |

## Spacing scale

| Token | Value |
|---|---|
| `--sp-1` | 4px |
| `--sp-2` | 8px |
| `--sp-3` | 12px |
| `--sp-4` | 16px |
| `--sp-5` | 24px |
| `--sp-6` | 32px |

## Radius

| Token | Value |
|---|---|
| `--radius-sm` | 4px |
| `--radius-md` | 6px |

Full pills (`999px`) only where a pill is genuinely meaningful (small status
chips). No uniform rounded cards; use thin dividers and hierarchy instead.

## Rules

- Color is reserved for meaning. Only alert levels, finding tiers, and the
  route/robot purple get saturated color. Everything else is neutral.
- Never rely on color alone. Every alert level and tier also has a text label
  or icon.
- Keyboard focus is a visible outline in `--text` (dark slate), not a saturated
  color.
- Respect `prefers-reduced-motion`. Motion only for state changes or user
  actions, never decoration.
- Text contrast meets WCAG AA on the off-white base.
