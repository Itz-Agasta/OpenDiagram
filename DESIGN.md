---
version: "alpha"
name: OpenDiagram
description: "A calm, editorial AI workspace for turning software architecture into diagrams, docs, and decisions."
colors:
  primary: "#1A1A1A"
  secondary: "#737373"
  tertiary: "#0CB300"
  neutral: "#D9D9D9"
  background: "#D9D9D9"
  surface: "#FFFFFF"
  surface-muted: "rgba(255,255,255,0.50)"
  surface-elevated: "rgba(255,255,255,0.80)"
  ink: "#1A1A1A"
  ink-muted: "rgba(0,0,0,0.70)"
  ink-faint: "rgba(0,0,0,0.50)"
  dark-surface: "#18181B"
  dark-panel: "#262626"
  on-dark: "#FFFFFF"
  on-dark-muted: "rgba(255,255,255,0.80)"
  border-soft: "rgba(0,0,0,0.10)"
  border-dark: "rgba(255,255,255,0.50)"
typography:
  display-xl:
    fontFamily: "Inter"
    fontSize: "78px"
    fontWeight: "400"
    lineHeight: "1.15"
    letterSpacing: "-0.06em"
  display-lg:
    fontFamily: "Inter"
    fontSize: "48px"
    fontWeight: "700"
    lineHeight: "1.4"
    letterSpacing: "-0.04em"
  body-lg:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: "400"
    lineHeight: "1.6"
    letterSpacing: "-0.02em"
  body-md:
    fontFamily: "Inter"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "1.7"
    letterSpacing: "0em"
  label-md:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: "500"
    lineHeight: "1.4"
    letterSpacing: "0em"
  editorial-label:
    fontFamily: "Instrument Serif"
    fontSize: "24px"
    fontWeight: "400"
    lineHeight: "1.2"
    letterSpacing: "0em"
    fontFeature: "italic"
rounded:
  sm: "6px"
  md: "8px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
  hero-media: "36px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "36px"
  section: "120px"
  section-mobile: "64px"
  page-x: "120px"
  page-x-mobile: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-dark}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "#2A2A2A"
  button-inverse:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  header-brand:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  page-shell:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.ink}"
  body-copy:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
  muted-label:
    textColor: "{colors.ink-faint}"
    typography: "{typography.label-md}"
  menu-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "8px"
    width: "30vw"
  translucent-card:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "40px"
  process-card:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "32px"
  section-divider:
    backgroundColor: "{colors.border-soft}"
    height: "1px"
  dark-feature-panel:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.lg}"
    padding: "48px"
  footer-panel:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.on-dark-muted}"
    rounded: "{rounded.xl}"
    padding: "80px"
  footer-divider:
    backgroundColor: "{colors.border-dark}"
    height: "1px"
---

# Design System: OpenDiagram

## Overview

OpenDiagram should feel like a quiet architecture studio for open-source maintainers: matte, editorial, technical, and calm. The interface pairs a soft warm-gray canvas with white tactile pills, black ink typography, oversized diagram-like composition, and occasional kinetic WebGL light. The brand is not a generic SaaS dashboard. It is a visual workspace that makes complex repositories feel inspectable and understandable.

Atmosphere scale:

- Density: 4/10, airy landing-page rhythm with large pauses between ideas.
- Variance: 7/10, centered editorial moments are allowed, but sections should include rotated cards, offset annotations, inline media, and asymmetric pacing.
- Motion: 6/10, continuous but quiet motion for background light, media loops, ticker strips, and scroll reveals.

Primary product promise: make software architecture legible. Design choices should support clarity, confidence, and craft instead of hype.

## Colors

The palette is intentionally neutral and restrained. Use the warm gray canvas as the dominant atmosphere, white for interactive objects, near-black for decisions and CTAs, and one restrained green accent for live/available states.

- **Warm Gray Canvas (#D9D9D9):** page background, footer frame, and overall atmospheric base. Avoid pure white full-page backgrounds.
- **Paper Surface (#FFFFFF):** header brand pill, menu card, CTA shells, process cards, and annotation chips.
- **Soft Paper Surface (rgba(255,255,255,0.50)):** translucent cards and frosted support panels.
- **Elevated Paper Surface (rgba(255,255,255,0.80)):** process cards and foreground surfaces that need stronger separation.
- **Charcoal Ink (#1A1A1A):** primary text, primary buttons, line art, icon strokes, and high-confidence actions.
- **Muted Ink (rgba(0,0,0,0.70)):** body copy, explanations, FAQ answers.
- **Faint Ink (rgba(0,0,0,0.50)):** secondary words, section divider lines, metadata, and quiet contrast.
- **Dark Panel (#262626):** portfolio/media sections and dark image wells.
- **Footer Black (#18181B):** footer background and high-contrast closing sections.
- **Live Green (#0CB300):** the only product accent. Use sparingly for availability dots, success states, and live status. Do not use it as a large brand wash.

Do not introduce purple-blue AI gradients, neon glows, or multiple competing accents. Small chip icon colors can be playful, but they must remain local decorative tags and never become the global palette.

## Typography

Typography is the core of the brand. Use Inter for product clarity and Instrument Serif Italic for editorial labels and human punctuation.

- **Display:** Inter, 78px desktop, 48px tablet, 36px mobile, weight 400, line-height 1.15, letter-spacing -0.06em. Use for hero and footer statements.
- **Section Heading:** Inter, 48px desktop, 30px mobile, weight 700, line-height 1.4, letter-spacing -0.04em.
- **Body:** Inter, 16px, line-height 1.7. Keep paragraphs under 65 characters where possible.
- **Large Body:** Inter, 24px, line-height 1.6, letter-spacing -0.02em. Use only for short high-value claims.
- **Labels and Buttons:** Inter, 14px, weight 500, compact but readable.
- **Editorial Labels:** Instrument Serif Italic, 24px, line-height 1.2. Use for section eyebrow phrases such as "FAQ", "Hello!", and "See Recent Work".

Never use generic serif fallbacks as a visible design choice. If Instrument Serif is unavailable, fall back quietly to the configured serif stack, but do not design new screens around Times, Georgia, Garamond, or Palatino.

## Layout

Use large, centered max-width containers with generous horizontal padding and clean stacking. The design should feel like a long-form editorial website, not an admin dashboard.

- Page gutters: 120px desktop, 24px mobile.
- Primary max width: 1440px.
- Secondary max width: 1366px for centered story sections.
- Hero top spacing: 180px desktop, 120px mobile.
- Section spacing: 120px desktop, 64px mobile.
- Mobile collapse: every horizontal layout must collapse below 768px.
- Avoid horizontal overflow on mobile. Decorative rotated chips and large arrows should hide or simplify below tablet widths.
- Prefer CSS grid or simple flex stacks. Do not use brittle percentage math unless matching an intentional media ticker.

Composition patterns:

- Hero uses inline media as typography. Small animated image blocks and logo tickers sit between words at headline height.
- Process cards use slight rotation and vertical offsets to imply hand-assembled architecture notes.
- FAQ uses a split composition: a rotated contact card beside a clean accordion list.
- Footer uses a dark rounded slab inset from the viewport, framed by the warm-gray canvas.

## Elevation & Depth

Depth should be tactile but quiet. Avoid glassmorphism as a default style; use translucency only when it helps a moving or dark background remain readable.

- White pills: no visible shadow unless floating over complex content.
- Process cards: subtle shadow, translucent white fill, optional backdrop blur.
- Menu card: white fill, 1px soft border, rounded-md, soft shadow, z-index above content.
- Dark media panel: no heavy shadow; rely on large rounded shape and contrast against the gray canvas.
- Footer: rounded black slab with thick warm-gray border to feel embedded into the page.

Never use neon outer glows. Never use heavy drop shadows that make surfaces feel like generic templates.

## Shapes

OpenDiagram is softly rounded and tactile, but not childish.

- Buttons: rounded pill, 999px radius.
- Small controls: rounded pill, 999px radius when circular or input-like.
- Dropdown/menu cards: rounded-md, 8px radius.
- Content cards: rounded-2xl, 16px radius.
- Footer slab: 24px radius.
- Inline hero media: 36px radius with black border.
- Avatars: circular with 1px white border.

Use rounded forms to imply approachability; use black line art and tight typography to preserve technical authority.

## Components

**Header**

The header is minimal: a white brand pill on the left and a circular menu button on the right. Brand text is bold. The menu icon must transition into a cross when open. The dropdown is an absolute-positioned `30vw` card aligned to the right of the nav container, with a minimum width of 200px, 8px internal padding, rounded-md corners, and enough top margin to avoid touching the button.

**Buttons**

Primary buttons are black pills with white text, 12px vertical padding, 24px horizontal padding, and a small arrow icon when navigating forward. Hover should reduce opacity or slightly deepen the fill. Active state can translate down by 1px. Do not add glow.

**Hero Inline Media**

Inline hero media blocks are part of the headline, not decorative afterthoughts. They should match the optical height of nearby words, use black borders, and rotate slightly (-2deg or +2deg). On mobile, they may shrink but must not overlap text.

**Cards and Chips**

Cards are soft white notes with 24px to 32px padding. Rotations should be small and purposeful, usually between -5deg and +9deg. Chips are small white pills with compact icon circles and can use local decorative colors. Hide dense decorative chips on mobile.

**Accordions**

FAQ accordions use border-bottom dividers, bold questions, muted answers, and a rotating chevron. Opening animation should affect height and opacity only.

**Dark Panels**

Dark panels use #262626 or #18181B, rounded corners, white text, and moving media. Text over dark surfaces should use white at 70-100% opacity.

**Background Effects**

The background may include subtle paper grain and low-opacity WebGL god rays. These effects must be pointer-events-none, fixed or absolute behind content, and must never reduce text contrast.

## Do's and Don'ts

Do:

- Use Inter and Instrument Serif exactly as defined in the Next font setup.
- Keep the warm gray canvas visible around large content slabs.
- Use oversized type with tight tracking for key statements.
- Use inline media, logo tickers, and small motion loops to make documentation feel alive.
- Use one global accent only: Live Green (#0CB300).
- Keep interactive targets at least 44px tall.
- Preserve readable contrast over shader, grain, and moving-media backgrounds.
- Use real product language about repositories, maintainers, diagrams, APIs, README files, and architecture.

Don't:

- Do not add purple/blue AI gradients, neon glows, or "magic sparkle" aesthetics.
- Do not use pure black as a design token; use Charcoal Ink or Footer Black.
- Do not add generic SaaS 3-card feature rows unless layout variance is introduced.
- Do not overlap text and imagery. Inline media can sit between words, but every element needs its own spatial zone.
- Do not use emojis in product UI.
- Do not use generic placeholder brands such as Acme, John Doe, or Startup Inc.
- Do not use fake metrics like 99.99%, 10x, or 50% unless backed by real product data.
- Do not use AI-copy cliches such as "elevate", "unleash", "seamless", "revolutionary", or "next-gen".
- Do not introduce circular loading spinners. Use skeleton shapes matching the final layout.
- Do not allow decorative animations to affect layout or cause content shifts.
