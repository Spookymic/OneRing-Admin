# Conserto Brand Guidelines — AI Implementation Reference
> Source: Charte graphique Conserto ©VUPAR 2024
> Usage: Reference file for AI-assisted UI/UX implementation

---

## 1. COLOR SYSTEM

### Primary Palette

| Name       | HEX       | RGB              | CMYK                  | Usage                          |
|------------|-----------|------------------|-----------------------|--------------------------------|
| Dark Blue  | `#01031B` | R1 G3 B27        | C96 M89 Y0 K89        | Primary background, main text  |
| White      | `#FFFFFF` | R255 G255 B255   | C0 M0 Y0 K0           | Background, light text         |
| Pink       | `#D8346E` | R216 G52 B116    | C0 M87 Y10 K9         | Accent, CTA, highlights        |

### Rules
- Typography must use **only** Dark Blue, Pink, or White.
- Black/white is reserved for office/print use only.
- **No other colors** outside this palette are permitted.
- **No gradients** applied across entire backgrounds.
- **No patterns or texture effects** on color fills.

### Footer Gradient (Optional)
- A circular radial gradient applied only at the **bottom** of a page/slide (bottom 10% of the layout).
- Three allowed combinations only:
  - Pink gradient on White background
  - Pink gradient on Dark Blue background
  - Dark Blue gradient on Pink background
- Gradient opacity: 100% at center → 50% mid → fades to 10% at edge zone.
- **No other color combinations** allowed for gradients.

---

## 2. TYPOGRAPHY

### Primary Typeface — Plus Jakarta Sans
- **Usage**: Body text, UI labels, navigation, general content
- **Weights used**: Light, Regular, Bold
- **Google Fonts**: `Plus Jakarta Sans`
- **Color rule**: Dark Blue, Pink, or White only

```
Font stack: 'Plus Jakarta Sans', sans-serif
Weights: 300 (Light), 400 (Regular), 700 (Bold)
```

### Secondary Typeface — Fraunces
- **Usage**: ONLY inside chevron brackets `‹ ... ›` — for expressive/highlight words
- **Weights used**: Light, Regular, Black
- **Google Fonts**: `Fraunces`
- **Color rule**: Dark Blue, Pink, or White only
- ⚠️ **STRICTLY FORBIDDEN** to use Fraunces outside chevron contexts

```
Font stack: 'Fraunces', serif
Weights: 300 (Light), 400 (Regular), 900 (Black)
```

### Typographic Hierarchy (recommended)

| Level        | Font              | Weight | Color      | Notes                        |
|--------------|-------------------|--------|------------|------------------------------|
| Display/Hero | Fraunces          | Black  | Pink       | Inside chevrons only         |
| H1           | Plus Jakarta Sans | Bold   | White      | On Dark Blue backgrounds     |
| H2           | Plus Jakarta Sans | Bold   | Dark Blue  | On White backgrounds         |
| H3           | Plus Jakarta Sans | Bold   | Dark Blue or Pink | Section titles          |
| Body         | Plus Jakarta Sans | Regular| Dark Blue or White | Depending on background |
| Caption      | Plus Jakarta Sans | Light  | Dark Blue or White | Small text              |

---

## 3. LOGO & ICONOTYPE

### Logo Rules
- Minimum size: **15mm** (print) — maintain equivalent px ratio for screen
- Clear space: **1/4 of the "C" symbol width** on all sides (primary logo)
- Clear space (secondary/icon): **1/2 of the "C" symbol width** on all sides

### Logo Variants
- **Primary logo**: Full `‹C› conserto` lockup — use when space allows
- **Secondary logo (icotype)**: `‹C›` symbol only — use for favicons, avatars, small UI contexts (minimum 5mm)
- **On Dark background**: Use light/white version
- **On Light background**: Use dark version
- **On Pink background**: Use Dark Blue version

### Forbidden Logo Modifications
| Action                        | Status      |
|-------------------------------|-------------|
| Distort/stretch proportions   | ❌ Forbidden |
| Outline/stroke effect         | ❌ Forbidden |
| Add drop shadow or effects    | ❌ Forbidden |
| Reduce opacity                | ❌ Forbidden |
| Rotate                        | ❌ Forbidden |
| Change typeface               | ❌ Forbidden |
| Remove logo elements          | ❌ Forbidden |
| Change colors                 | ❌ Forbidden |
| Invert element order          | ❌ Forbidden |

---

## 4. CHEVRON SYSTEM

### Concept
Chevrons (`‹` and `›`) are a core brand element derived from code syntax (`<>`). They frame expressive content and act as a dynamic zone of expression.

### Usage Patterns
```
‹ [keyword/emoji/image] ›
```

- **Text + Chevrons**: A key word set in Fraunces Bold/Black (Pink) between chevrons, aligned on a horizontal axis with the surrounding Plus Jakarta Sans body text.
- **Image + Chevrons**: Photo or 3D emoji placed between chevrons, centered on the alignment axis.
- **Text + Image + Chevrons**: Combined layout with chevrons anchoring the composition horizontally.

### Alignment Axis
- All elements (chevrons, text, emoji, image) share a **single horizontal axis**.
- Chevrons can be **translated vertically** within a defined zone (not freely placed).
- Chevrons scale in **size and weight** to convey emotion/emphasis.

### Composition Rules
- Use only **one 3D emoji** per visual — never multiple.
- The emoji must relate semantically to the text content.
- Secondary typeface (Fraunces) is **only** used inside chevron expression zones.

---

## 5. SHAPES & LAYOUT

### Rounded Forms
- Photos and images should be cropped using **rounded/oval shapes** to evoke friendliness and approachability.
- Avoid hard rectangular crops for portrait photography.

### Grid & Alignment
- Always maintain clear alignment between text, chevrons, images, and logos.
- Compositions should use a clear **visual axis** for eye guidance.
- White space is essential — do not crowd elements.

### Layout Backgrounds
Three allowed base backgrounds:
1. `#FFFFFF` White
2. `#01031B` Dark Blue
3. `#D8346E` Pink

---

## 6. ICONOGRAPHY

### 3D Emojis
- Use **3D cartoon-style emojis** (not flat emoji).
- Color palette of emojis should complement brand colors.
- Used as a single expressive element per composition.
- Placed inside or alongside chevron zones.

### Photography Style
**Portraits**:
- Casual/relaxed work context
- Shallow depth of field (blurred background)
- Authentic, warm, human feel
- Cropped in rounded/oval shapes

**Team shots**:
- Groups collaborating, in action
- Authentic moments, not staged-looking
- Natural lighting preferred

---

## 7. APPLICATION CONTEXTS

### Social Media Posts
- Square or portrait format
- Use chevron + text or chevron + image compositions
- Logo (icotype `‹C›`) in corner
- One emoji maximum per post
- Footer gradient optional

### Presentation Slides
- Dark Blue or White background preferred
- Pink as accent color for key words (in chevrons)
- Footer gradient recommended
- Logo in corner

### Press / Print Ads
- Large expressive Fraunces type in chevrons for headline
- Plus Jakarta Sans for body copy
- High contrast compositions (Dark Blue + White + Pink)

### Stationery
- Letterhead: Logo top-left, footer gradient at bottom
- Business cards: Logo + name (Fraunces for first name inside chevrons)
- Envelopes: Pink accent strip or background

---

## 8. CSS VARIABLES (Web Implementation)

```css
:root {
  /* Colors */
  --color-dark-blue: #01031B;
  --color-white: #FFFFFF;
  --color-pink: #D8346E;

  /* Typography */
  --font-primary: 'Plus Jakarta Sans', sans-serif;
  --font-secondary: 'Fraunces', serif;

  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-bold: 700;
  --font-weight-black: 900;

  /* Spacing (based on logo clear space unit) */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 32px;
  --space-xl: 64px;

  /* Border Radius (rounded shapes) */
  --radius-soft: 24px;
  --radius-oval: 50%;
  --radius-card: 16px;

  /* Gradient (footer only) */
  --gradient-pink-on-dark: radial-gradient(ellipse at bottom center, #D8346E 0%, rgba(216,52,110,0.5) 50%, transparent 100%);
  --gradient-pink-on-white: radial-gradient(ellipse at bottom center, rgba(216,52,110,0.6) 0%, rgba(216,52,110,0.2) 50%, transparent 100%);
  --gradient-dark-on-pink: radial-gradient(ellipse at bottom center, #01031B 0%, rgba(1,3,27,0.5) 50%, transparent 100%);
}
```

---

## 9. TAILWIND CONFIG (if using Tailwind CSS)

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'brand-dark': '#01031B',
        'brand-pink': '#D8346E',
        'brand-white': '#FFFFFF',
      },
      fontFamily: {
        primary: ['"Plus Jakarta Sans"', 'sans-serif'],
        secondary: ['Fraunces', 'serif'],
      },
      fontWeight: {
        light: 300,
        regular: 400,
        bold: 700,
        black: 900,
      },
      borderRadius: {
        soft: '24px',
        oval: '50%',
        card: '16px',
      },
    },
  },
}
```

---

## 10. GOOGLE FONTS IMPORT

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,900;1,9..144,300&family=Plus+Jakarta+Sans:wght@300;400;700&display=swap" rel="stylesheet">
```

---

## 11. BRAND VOICE IN UI COPY

- Tone: Dynamic, positive, human, innovative
- Short expressive phrases favored (e.g. "Pink is the new black", "Up to you")
- Key words or concepts should be visually highlighted using the chevron system
- English and French are both used — maintain consistency per project language

---

## 12. QUICK REFERENCE — DO & DON'T

| DO ✅                                              | DON'T ❌                                          |
|----------------------------------------------------|---------------------------------------------------|
| Use Dark Blue, Pink, White only                    | Add custom or brand-adjacent colors               |
| Apply Fraunces only inside chevron zones           | Use Fraunces for body text or headings            |
| Use one 3D emoji per composition                   | Stack multiple emojis on one visual               |
| Crop photos in rounded/oval shapes                 | Use hard rectangular photo crops                  |
| Use footer radial gradient (optional, 3 combos)    | Apply gradients across full backgrounds           |
| Maintain logo clear space zones                    | Place elements in the logo exclusion zone         |
| Use chevrons to frame key expressive content       | Use chevrons decoratively without semantic purpose|
| Scale chevrons for emphasis                        | Rotate, skew, or distort chevrons                 |
