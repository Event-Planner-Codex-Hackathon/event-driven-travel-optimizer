---
name: EventHopper
description: An airport departure board for trips built around a fixed event and a fixed budget.
colors:
  sky-ground: "oklch(0.3 0.1 255)"
  sky-ground-deep: "oklch(0.19 0.06 262)"
  sky-shadow: "oklch(0.1 0.04 262)"
  on-sky: "oklch(0.97 0.01 250)"
  on-sky-muted: "oklch(0.88 0.035 250)"
  signal-yellow: "oklch(0.87 0.175 91)"
  signal-yellow-shade: "oklch(0.81 0.165 86)"
  sign-ink: "oklch(0.18 0.01 255)"
  graphite: "oklch(0.25 0.008 255)"
  graphite-line: "oklch(0.36 0.008 255)"
  flap-glyph: "oklch(0.95 0.008 95)"
  enamel: "oklch(0.985 0 0)"
  enamel-line: "oklch(0.86 0.005 255)"
  muted-ink: "oklch(0.42 0.01 255)"
  lamp-fixed: "oklch(0.75 0.19 148)"
  lamp-flex: "oklch(0.82 0.165 75)"
  lamp-swap: "oklch(0.74 0.13 235)"
  lamp-unknown: "oklch(0.66 0.2 28)"
  alert: "oklch(0.52 0.2 28)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.6rem, 1.9rem + 3vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.005em"
  lede:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(1.3rem, 1.15rem + 0.6vw, 1.6rem)"
    fontWeight: 400
    lineHeight: 1.45
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.15
  sign:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(0.875rem, 0.84rem + 0.15vw, 0.95rem)"
    fontWeight: 400
    lineHeight: 1.45
  flap:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontWeight: 600
    lineHeight: 1
rounded:
  none: "0px"
  lamp: "50%"
spacing:
  2xs: "0.375rem"
  xs: "0.625rem"
  s: "1rem"
  m: "1.5rem"
  l: "clamp(2rem, 1.5rem + 2vw, 3rem)"
  xl: "clamp(3rem, 2rem + 4vw, 5.5rem)"
  2xl: "clamp(4.5rem, 3rem + 6vw, 8.5rem)"
  gutter: "clamp(1rem, 0.5rem + 2.4vw, 2.5rem)"
components:
  sign-band:
    backgroundColor: "{colors.sign-ink}"
    textColor: "{colors.signal-yellow}"
    height: "3.75rem"
    padding: "0.5rem {spacing.gutter}"
  sign-button:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.sign-ink}"
    typography: "{typography.sign}"
    rounded: "{rounded.none}"
    height: "3.5rem"
    padding: "0.5rem 1.35rem 0.55rem 1rem"
  sign-button-hover:
    backgroundColor: "{colors.signal-yellow-shade}"
  sign-button-dark:
    backgroundColor: "{colors.sign-ink}"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.sign}"
    rounded: "{rounded.none}"
    height: "3.5rem"
  sign-button-dark-hover:
    backgroundColor: "{colors.graphite}"
  nav-cta:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.sign-ink}"
    rounded: "{rounded.none}"
    height: "2.5rem"
    padding: "0.3rem 0.85rem 0.3rem 1rem"
  enamel-panel:
    backgroundColor: "{colors.enamel}"
    textColor: "{colors.sign-ink}"
    rounded: "{rounded.none}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.enamel}"
    textColor: "{colors.sign-ink}"
    rounded: "{rounded.none}"
    height: "3.25rem"
    padding: "0 0.85rem"
  stop-chip:
    backgroundColor: "{colors.enamel}"
    textColor: "{colors.sign-ink}"
    rounded: "{rounded.none}"
    height: "3rem"
    padding: "0 1.3rem"
  stop-chip-selected:
    backgroundColor: "{colors.sign-ink}"
    textColor: "{colors.signal-yellow}"
  board-row:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.flap-glyph}"
    rounded: "{rounded.none}"
    padding: "1rem 1.1rem"
  synthetic-label:
    backgroundColor: "{colors.sign-ink}"
    textColor: "{colors.signal-yellow}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.65rem"
---

# Design System: EventHopper

## Overview

**Creative North Star: "The Departure Hall at Night"**

EventHopper is an airport hall after dark. A deep-blue sky fills the ground, seen through out-of-focus curtain-wall frames, and a graphite split-flap board hangs from steel rods in front of it. The trip is read out on that board: route rows flip, while the rows for the event and the budget stay lit and never change. Everything else is wayfinding. A black sign band runs overhead, yellow signs point to the next action, and the forms sit on white enamel panels like the information boards beside a gate.

The system is calm and legible rather than glossy. Colour is kept to the ground, one signal hue, graphite, enamel and four status lamps that have fixed meanings. Two typefaces split the work: a condensed signage face for anything you would find on a sign or a flap, and a hyperlegible reading face for sentences and entered values. Corners are square throughout. Depth comes from physical objects such as the hung board and the enamel panels, never from decorative effects.

Motion belongs to the hall. Flaps flip when the board changes, the sky shifts tone and a light sweep crosses the glass, captions crossfade, and the board and sky lean slightly toward the pointer. Every one of these effects has a still equivalent under reduced motion, and the board has a pure CSS version for when WebGL is unavailable.

**Key Characteristics:**
- Deep-blue live sky as the only ground; no flat page background competes with it.
- Signal yellow is spent on signs and actions only.
- A graphite split-flap board with off-white condensed glyphs and four status lamps is the signature object.
- White enamel panels hold forms; graphite rows hold results.
- Barlow Condensed for signage, Atkinson Hyperlegible Next for reading.
- Square corners everywhere except round lamps.
- Every animation has a reduced-motion state and a non-WebGL fallback.

## Colors

A night-hall palette: saturated deep blue for the ground, near-black for signage, graphite for the board, white enamel for information, one yellow signal hue and four lamp colours.

### Primary
- **Signal Yellow** (signal-yellow): the wayfinding colour. Used for the sign-band wordmark and links, primary sign buttons, the active step bar, the focus ring on dark grounds, the selected stop chip's text, route tags and the synthetic-data label. On hover it deepens to **Signal Yellow Shade** (signal-yellow-shade).

### Secondary
- **Night Sky Blue** (sky-ground): the ground. It is the CSS colour behind the live sky shader and the static fallback. **Deep Night** (sky-ground-deep) sits behind the page, under the scrollbar and behind the pinned board in short-screen mode. **Sky Shadow** (sky-shadow) tints the drop shadows cast onto the sky.
- **The live sky** is rendered by a WebGL shader with one palette per story step. Each palette has a top, a bottom and a glow colour, all deep blues, with one violet-leaning glow for the price step. When the step changes, the sky eases toward the new palette, and the glow colour lights the pointer reflection, the horizon haze and the light sweep. These palettes belong to the shader and are not used as flat surface colours.

### Tertiary: status lamps
- **Fixed Green** (lamp-fixed): never moves. Used for event and budget rows, routes within budget, the "Fixed" lock label and positive budget differences.
- **Flex Amber** (lamp-flex): can shift, for example a departure window.
- **Swap Blue** (lamp-swap): can be swapped, for example the optional stop.
- **Unknown Red** (lamp-unknown): unknown or over budget. It is the default lamp on result rows until a route is shown to be within budget.

### Neutral
- **Sign Ink** (sign-ink): the sign band, the footer, the arrow tiles on sign buttons, input borders and text on enamel.
- **Graphite** (graphite): the board face, the event row and result rows. **Graphite Line** (graphite-line) divides graphite surfaces.
- **Flap Glyph** (flap-glyph): warm off-white characters and text on graphite.
- **Enamel** (enamel): form panels and inputs. **Enamel Line** (enamel-line) divides sections inside a panel.
- **Muted Ink** (muted-ink): hints, units and assumptions on enamel.
- **On Sky** (on-sky) and **On Sky Muted** (on-sky-muted): text on the blue ground, and legends and inactive step labels.
- **Alert** (alert): invalid input borders and error text on enamel.

### Named Rules
**The Signal Is Spent On Signs Rule.** Yellow appears only on things that act or point: sign buttons, the nav call to action, the sign band, the active step, focus rings and labels that must never be missed. It is never used for body text, decoration or large fills that are not a sign.

**The Lamp Grammar Rule.** Each of the four lamp colours has exactly one meaning: fixed, flexible, swappable, unknown or over budget. A lamp is never decorative. Wherever lamps appear, a text legend or label is nearby, so colour is never the only signal.

**The One Sky Rule.** The live sky is the only gradient in the system. Surfaces such as panels, rows, buttons and bands are solid.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif), weights 500 to 700
**Body Font:** Atkinson Hyperlegible Next (with system-ui, sans-serif), weights 400 to 700

**Character:** Airport signage paired with a reading face designed for legibility. The condensed face carries the hall's voice; the reading face makes sure sentences, dates and money are easy to read.

### Hierarchy
- **Display** (700, clamp 2.6–4.5rem, 0.98): story caption titles and the plan section title. Wrapping is balanced.
- **Lede** (Atkinson 400, clamp 1.3–1.6rem, 1.45): the single subcopy line under the board, at most 54ch.
- **Title** (700, 1.35rem, 1.15): route titles, route totals and route letters on result rows. The event name uses 1.55rem in uppercase with 0.02em tracking.
- **Sign** (700, 1.4rem, 1): the text on sign buttons. The wordmark uses 1.65rem.
- **Label** (600, 1.2rem, 1.2): form labels, nav links, unit suffixes and step labels (1.05rem).
- **Body** (Atkinson 400, clamp 1.0625–1.1875rem, 1.6): caption body, at most 62ch.
- **Small** (Atkinson 400–500, clamp 0.875–0.95rem, 1.45): hints, errors, legends, route paths, footer text.
- **Flap** (600, uppercase): split-flap characters. The size is set by the cell, and the flaps take their character set from a texture atlas drawn in this face.

### Named Rules
**The Two Voices Rule.** If it is on a sign, a button, a label or a flap, set it in Barlow Condensed. If it is read as a sentence or typed into a field, set it in Atkinson Hyperlegible Next. Values typed into inputs use the reading face with tabular figures.

## Layout

There is one centred column with a maximum width of 1120px, inset by a fluid gutter (spacing.gutter). The spacing rhythm follows the s/m/l/xl/2xl scale, with fluid clamps from l upward.

- **Story track:** with scripting enabled, the hero is a sticky stage pinned under the 3.75rem sign band. The track's height is 80svh per story step plus 20svh. The stage stacks the board, the active caption and the step bar in a grid with auto, 1fr and auto rows. Board width follows the board's aspect ratio (2.502 wide, 1.597 narrow) so the board, its caption and the step bar fit in one viewport. Captions and step bar are inset by 2.7% so they line up with the board case.
- **Without scripting:** the stage is static and all captions stack in reading order. The step bar is hidden.
- **Short screens (max-height 620px):** the board pins under the sign band on a Deep Night strip, and all captions are fully visible and scroll beneath it with 45svh gaps. The step bar is hidden.
- **Plan section:** a 4/8 split, with the title and intro on the left and the enamel panel on the right. It collapses to one column at 780px.
- **Breakpoints:** 780px (board switches to 18 columns, plan and fields collapse to one column, route money moves under the title) and 520px (nav links hide, the step bar becomes five equal columns).

## Elevation & Depth

Depth is physical. Objects that hang in or stand in the hall cast shadows onto the sky, and nothing else is lifted. Buttons, chips and inputs are flat.

### Shadow Vocabulary
- **Enamel panel** (`box-shadow: 0 2px 0 oklch(0.1 0.04 262 / 0.9), 0 30px 60px -28px oklch(0.08 0.04 262 / 0.75)`): a thin dark edge under the panel plus a long, soft drop onto the sky.
- **Fallback board** (`box-shadow: 0 2px 0 oklch(0.14 0.01 255), 0 28px 40px -22px oklch(0.1 0.04 262 / 0.7)`): the same idea for the CSS board.
- **Lamp lens** (`box-shadow: inset 0 -2px 0 oklch(0 0 0 / 0.22)`): a small inner shade that makes inline and row lamps read as lenses.
- **3D board:** real-time lighting with a key light, a cool fill light, cast shadows from the steel rods, emissive lamp lenses with a glow, satin flaps and a metal case.

### Named Rules
**The Hung, Not Floating Rule.** Only physical objects get depth: the board, which hangs from rods, and the enamel panels. Interactive controls never get shadows; their states change colour, underline or arrow position instead.

## Shapes

Every corner is square (rounded.none). Buttons, chips, inputs, panels, rows, tags, step bars and the wordmark tile are all rectangles. The only round shapes are the status lamps (rounded.lamp). Borders are solid ink strokes of 2px on enamel (3px on invalid inputs), or 1px enamel-line dividers inside panels. Pictograms are solid, square-ended shapes on a 24-unit grid: arrow right, arrow down, lock and plane. The board's ">" arrow is drawn into the flap atlas, not taken from the font.

### Named Rules
**The Square Corner Rule.** A radius above zero is off-system. Only lamps are round.

## Components

### Buttons
Wayfinding signs that you press.
- **Shape:** square (rounded.none), at least 3.5rem tall.
- **Primary sign button:** a yellow sign with a separate ink arrow tile (2.7rem wide, inset 0.4rem) and a 700-weight label. It is used for the main calls to action, such as "Plan around my event".
- **Dark sign button:** an inverted ink sign with a yellow arrow tile. It is used on enamel panels, such as "Find routes", where a yellow fill would lose contrast against white.
- **Hover / Focus:** the fill steps to Signal Yellow Shade (Graphite on the dark variant), and the arrow moves 3px in its direction over 0.35s on the ease-out curve. Focus is a 3px outline offset by 3px, yellow on dark grounds and ink on enamel. A disabled button shows a progress cursor at 0.75 opacity.
- **Text button:** a Barlow 600 underlined link on the sky, with a 2px underline that thickens to 3px on hover and an arrow that moves down.

### Chips (stop choice)
- **Style:** an enamel rectangle with a 2px ink border and a Barlow 600 label at 1.25rem. The native radio is overlaid invisibly so it can still be operated.
- **State:** hovering adds a pale yellow wash. When selected, the chip becomes ink with yellow text. Focus draws a 3px ink outline.

### Cards / Containers (enamel panel)
- **Corner Style:** square.
- **Background:** Enamel with ink text. The event row at the top is a graphite strip with a green lamp, an uppercase event name, a green "Fixed" lock label and an outlined "Edit event" control.
- **Shadow Strategy:** Enamel panel shadow (see Elevation & Depth).
- **Internal Padding:** 1.25rem. The field grid uses 1.5rem horizontal and 1.6rem vertical gaps, with two columns that collapse to one at 780px.

### Inputs / Fields
- **Style:** 3.25rem tall, a 2px ink border, an Enamel fill and the reading face with tabular figures. Static values, such as a fixed origin, sit on a pale grey fill with no border.
- **Hover / Focus:** hovering adds a faint yellow tint. Focus draws a 3px ink outline offset by 2px.
- **Error:** a 3px Alert border with Alert text below it. Hints use Muted Ink and the small style.
- **Money:** the currency unit (TRY) is a Barlow label inset at the right of the field.

### Navigation
- **Sign band:** a sticky black band, 3.75rem tall. It holds the wordmark (a yellow tile with a plane rotated 90 degrees, then "EventHopper" in Barlow 700), yellow Barlow nav links whose underline fades in on hover, and a compact yellow "Plan a trip" sign. Nav links hide below 520px.
- **Step bar:** five labelled bars (Start, Your trip, Swap, Prices, Book) that show scroll position and jump to a step. Inactive bars are on-sky at 25% (50% on hover). The current step's bar is Signal Yellow and its label is On Sky.

### Split-Flap Board (signature)
A realistic three.js board built entirely in code: a metal case with bezel and screws, steel rods with collars rising out of frame, graphite flaps in channels with a centre split, off-white Barlow Condensed glyphs, and one status lamp lens at the end of each row.
- **Grid:** five rows. 30 columns on wide screens and 18 columns at 780px and below.
- **Motion:** when the text changes, each cell falls through up to 10 flaps, taking 55 to 75ms per flap, with a 45ms rebound and a small random tilt on each flap. Lamps crossfade over 120ms. The camera leans toward the pointer (up to 2.5 degrees of yaw and 1.5 degrees of pitch) with eased damping.
- **Reduced motion:** cells and lamps jump straight to their final state, and pointer parallax is off.
- **Fallback:** a CSS board (a graphite face, a row strip per row, a cell grid with a centre split line, round lamps and two rod stubs) renders first and fades out over 0.7s once WebGL is ready. The board text is always available to screen readers.

### Result rows
Route results use the board's grammar on enamel: graphite rows separated by 2px gaps, each with a lamp (green if within budget, red otherwise), a letter tile, a Barlow title with an optional yellow tag, a reading-face path and note, and a right-aligned total marked as an estimate along with the difference from budget.

### Synthetic-data label
An ink rectangle with yellow Barlow 600 text. It sits wherever example or synthetic prices are shown, so demo values are never mistaken for live offers.

### Captions and the sky (motion)
- **Captions:** the active caption fades in over 0.45s, rises from 14px over 0.7s and clears a 6px blur over 0.5s, starting 0.08s after the outgoing caption leaves. Under reduced motion, captions only crossfade opacity over 0.2s.
- **Sky:** on each step change, the shader eases toward the new palette, and a 1.4s band of light sweeps diagonally across the glass. The cloud banks drift slowly. Mullions, clouds and a soft light reflection follow the pointer. Under reduced motion, the sky is drawn once per change with no drift, sweep or easing.
- **Easing:** cubic-bezier(0.16, 1, 0.3, 1) is used for all CSS state transitions.

## Do's and Don'ts

### Do:
- **Do** keep the deep-blue live sky as the ground of every hall surface, with Night Sky Blue as its static colour.
- **Do** reserve Signal Yellow for signs, actions, the active step and focus.
- **Do** use lamps only with their fixed meanings (fixed green, flex amber, swap blue, unknown red), always with a text legend or label.
- **Do** set signage, labels, buttons and flaps in Barlow Condensed, and sentences and entered values in Atkinson Hyperlegible Next.
- **Do** put forms on white enamel panels with 2px ink borders, and show results as graphite board rows.
- **Do** keep every corner square; only lamps are round.
- **Do** give every animation a reduced-motion state and every WebGL element a CSS or static fallback.
- **Do** show the synthetic-data label wherever example prices appear.

### Don't:
- **Don't** use yellow for body text, decorative fills or highlights that are not signs.
- **Don't** use a lamp colour decoratively, or as the only carrier of meaning.
- **Don't** add shadows to buttons, chips or inputs; depth belongs to the hung board and the enamel panels.
- **Don't** add gradients to surfaces; the sky is the only gradient.
- **Don't** round corners.
- **Don't** flip the event or budget rows; they stay fixed and lit while route rows change.
- **Don't** use a destination photo with a search bar, or a dark globe with glowing arcs, as the hero; the board is the hero.
