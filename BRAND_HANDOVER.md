# Handover: Kasi Zonke Link Name & Logo → All Fleet Apps

> **Audience:** AI / developer working in any app that shares the `e-comm-bd997` backend —
> Super Admin (`fleet-admin-hub-main`), Restaurant Admin / Orderly Hub (`orderlyhub-main`),
> or the customer app (`customerapp-main`).
> **Source of truth:** the customer app's shipped code — `src/components/app/logo.tsx`,
> `src/styles.css`, `public/*.svg`. Snapshot as of **2026-09-24**, after the rename from Hearth.
> **Scope:** one name and one mark across every app. No schema, API contract or identifier
> format changes — see §6 for two things that look like branding and are not.

---

## 1. The brand is Kasi Zonke Link

Three apps share one Firebase backend (`e-comm-bd997`) and have drifted to three different
names. The customer app says **Kasi Zonke Link**, the backend project is named **ForkFleet**, and an
existing handover doc calls the product **Flavor Finder**. Customers have seen more than one
of these.

One name, one mark, everywhere: **Kasi Zonke Link**.

Kasi Zonke Link is the name in the customer app's page titles, navigation, metadata and
installed-app manifest, so it is the only one that exists in a finished state and the cheapest
to standardise on. It replaced **Hearth** on 2026-09-24 — treat any remaining `Hearth` string
in a sibling repo as stale.

| App | Repo | What it needs |
|---|---|---|
| Customer app | `customerapp-main` | Done — this is the reference implementation |
| Super Admin | `fleet-admin-hub-main` | Adopt the name and mark on all console chrome |
| Restaurant Admin / Orderly Hub | `orderlyhub-main` | Adopt the name and mark on all console chrome |

Every path, hex value and SVG string below is copied from the customer app's shipped code, not
invented for this document. Copy them verbatim rather than redrawing or re-deriving anything.

---

## 2. The name

Write it **Kasi Zonke Link** — three words, each capitalised. Never `KASI ZONKE LINK`,
`kasi zonke link`, `KasiZonkeLink` or `Kasi Zonke Link App` in customer-facing prose.

| Context | String |
|---|---|
| Product name | `Kasi Zonke Link` |
| Page title suffix | `<Page> — Kasi Zonke Link` (em dash, spaces both sides) |
| Home page title | `Kasi Zonke Link — Food delivery from local kitchens` |
| Installed app / short name | `Kasi Zonke` — the full name truncates on a home screen |
| Legal entity on receipts | `Kasi Zonke Link (Pty) Ltd` — **placeholder, confirm the registered entity** |
| Bank transfer reference shown to customers | `KASI ZONKE / <customer name>` |

### Console naming

The two admin consoles are staff tools, not the consumer product. Name them as a Kasi Zonke
surface rather than inventing a sibling brand:

- Super Admin → **Kasi Zonke Admin**
- Restaurant Admin / Orderly Hub → **Kasi Zonke Kitchen**

Both use the same mark and the same colours. If you prefer different sub-names, that is fine —
but the first words stay Kasi Zonke and the mark does not change.

### What to replace

Search each repo for these and replace with the Kasi Zonke Link equivalent:

- `Hearth` / `hearth` in anything a user reads
- `ForkFleet` / `forkfleet` in anything a user reads
- `Flavor Finder`
- `Orderly Hub` / `orderlyhub` in page titles, headers, emails and login screens
- any `twitter:site` or social handle pointing at the build platform rather than the product

### What stays ForkFleet

`ForkFleet` is the correct name of the shared backend project. Leave it in code comments,
internal config and the Firebase app instance name. It is accurate there, and renaming buys
nothing.

---

## 3. The mark

A hollow flame. One closed path with the core cut out, so it holds together at small sizes and
survives in a single colour. The mark itself did not change with the rename.

**Copy this path exactly. Do not redraw it, trace it, or regenerate it from a description.**

```
viewBox:    0 0 32 32
fill-rule:  evenodd

M16 4C20.5 10 25 13.5 25 19A9 9 0 0 1 7 19C7 13.5 11.5 10 16 4Z
M16 13C18 16 20 17.8 20 20.5A4 4 0 0 1 12 20.5C12 17.8 14 16 16 13Z
```

The two subpaths are one `<path>` element. The second is the hole; without
`fill-rule="evenodd"` it fills in solid and the mark turns into a blob.

### Minimum viable render

```html
<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"
    d="M16 4C20.5 10 25 13.5 25 19A9 9 0 0 1 7 19C7 13.5 11.5 10 16 4ZM16 13C18 16 20 17.8 20 20.5A4 4 0 0 1 12 20.5C12 17.8 14 16 16 13Z"/>
</svg>
```

Use `currentColor` and size it from the outside, so the mark recolours per surface. Inline the
SVG rather than using `<img>` — an `<img>` cannot inherit colour.

### Geometry facts

These are measured, not estimated. Use them to check your render.

| Property | Value |
|---|---|
| Outer flame extent | x 7–25, y 4–28 of 32 |
| Inner cut extent | x 12–20, y 13–24.5 of 32 |
| Horizontal centre | x = 16 (optically centred) |
| Thinnest wall | 3.5 units ≈ 2.6px at a 24px icon |
| Both subpaths | closed exactly, gap 0.0000 |

### Rules

- **Never** re-space, re-weight or add a stroke. It is a fill-only mark.
- **Never** place it on a background between roughly 30% and 70% luminance — the hole stops
  reading. Use the brand cream or the brand orange.
- Minimum size 16px. Below that use a solid dot or no mark at all.
- Clear space around it ≥ the width of the inner cut (8 units, i.e. 25% of the mark's width).
- The app-icon lockup scales the flame to **0.78** inside a 32×32 rounded square with `rx="7"`.

---

## 4. Colour

The brand orange is `#fb4500`. Everything else is the warm-parchment palette the customer app
already ships.

The customer app defines these in `oklch`; the hex is the exact sRGB conversion, for tools that
cannot take `oklch`.

| Role | Hex | oklch | Used for |
|---|---|---|---|
| Primary | `#fb4500` | `oklch(0.653 0.229 38.5)` | The mark, primary buttons, active states |
| Primary (dark mode) | `#ff5f0d` | `oklch(0.7 0.216 40)` | Same, on dark surfaces |
| Background | `#fcfaf7` | `oklch(0.986 0.005 85)` | Page background, the flame on the app icon |
| Foreground | `#1c1917` | `oklch(0.216 0.007 55)` | Body text, the wordmark |
| Secondary / muted | `#f0eae1` | `oklch(0.939 0.014 79)` | Cards, inputs, chips |
| Success | `#249057` | `oklch(0.58 0.13 155)` | Paid, delivered, confirmed |
| Destructive | `#e7000b` | `oklch(0.577 0.245 27.3)` | Failed, cancelled, delete |

The orange is a signal colour. Use it for the mark, the primary action and live status — not
for large fills or page backgrounds.

### Typography

| Role | Family |
|---|---|
| Display and body | Inter |
| Numerals, ids, references | JetBrains Mono |

The wordmark is Inter at weight 900, letter-spacing `-0.02em`. Order numbers, receipt numbers,
points balances and money all set in JetBrains Mono with tabular numerals, so columns line up.

### Browser and OS chrome

- `theme-color` → `#fb4500`
- Manifest `background_color` → `#fcfaf7`
- Manifest `theme_color` → `#fb4500`

---

## 5. Asset files

Copy these four files from `customerapp-main` into each repo. They are small and
self-contained — no build step, no dependency.

| File | Purpose |
|---|---|
| `public/favicon.svg` | App icon: cream flame on an orange rounded square. Browser tab, iOS home screen |
| `public/logo-mark.svg` | Flame alone in orange. Pinned-tab mask, standalone use |
| `public/logo-wordmark.svg` | Flame + "Kasi Zonke Link" set in Inter 900. Emails, docs, exports |
| `public/site.webmanifest` | Installed-app name, icons, theme colours |

The manifest carries the product name — change `name` and `short_name` per console
(`Kasi Zonke Admin`, `Kasi Zonke Kitchen`), keep the icons and colours identical.

### favicon.svg, in full

This is the whole file. It is the only asset that hardcodes colour, because a browser tab
cannot inherit one.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Kasi Zonke Link">
  <rect width="32" height="32" rx="7" fill="#fb4500"/>
  <g transform="translate(16 16) scale(0.78) translate(-16 -16)">
    <path fill="#fcfaf7" fill-rule="evenodd" clip-rule="evenodd"
      d="M16 4C20.5 10 25 13.5 25 19A9 9 0 0 1 7 19C7 13.5 11.5 10 16 4ZM16 13C18 16 20 17.8 20 20.5A4 4 0 0 1 12 20.5C12 17.8 14 16 16 13Z"/>
  </g>
</svg>
```

### A component, not an image tag

In-app, render the mark as inline SVG from a shared component so it inherits `currentColor`.
The customer app exports three variants from `src/components/app/logo.tsx`:

| Export | What it is | Where it goes |
|---|---|---|
| `BrandMark` | Flame alone, `currentColor` | Nav bars, tight headers |
| `BrandBadge` | Flame in a filled tile | Hero, empty and error states |
| `BrandLogo` | Mark + wordmark | Top nav, auth screens, error pages |

The exports are named for the role, not the brand, so the next rename is one string rather
than a refactor.

Keep the wordmark as real text, not a path. It stays selectable, it is announced correctly by
screen readers, and it does not need a second asset per weight.

### Still missing

There is no raster export yet. `og:image` is unset in all three apps, so shared links show no
preview image. Someone needs to export `logo-wordmark.svg` at **1200×630** on `#fcfaf7` and
commit it as `public/og-image.png`, then set `og:image` and `twitter:image`. Do this once and
reuse the same file across all three repos.

---

## 6. Where the mark goes

Every app needs all seven. The easiest ones to forget are the error pages and the mobile
header — in the customer app, mobile had no branding at all above the fold until this pass.

| Surface | What to show |
|---|---|
| Browser tab | `favicon.svg` first, any old `.ico` kept as `alternate icon` |
| Installed app / home screen | `apple-touch-icon`, `mask-icon`, `manifest` |
| Desktop top nav | `BrandLogo` — mark + wordmark, linking home |
| Mobile header | `BrandMark` alone; the wordmark will not fit |
| Sign-in / auth screen | Mark or full logo. This is the first screen a new user sees |
| 404 and client error screens | Full logo above the message |
| Server-side crash page | Mark inlined as raw SVG |

### The head block

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico" type="image/x-icon">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="mask-icon" href="/logo-mark.svg" color="#fb4500">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#fb4500">
<meta name="application-name" content="Kasi Zonke Link">
<meta name="apple-mobile-web-app-title" content="Kasi Zonke">
```

Order matters: SVG first, `.ico` as the fallback. A browser takes the first format it
understands.

### The crash page is not optional

A server-side error page usually cannot import your component or your stylesheet. That is
exactly why it gets skipped, and exactly when a user most needs to know they are still on your
product rather than a broken host.

Inline the SVG and hardcode the two hex values in that file. Put a comment next to it pointing
at the shared component, so the two are changed together.

### Accessibility

- The mark is decorative wherever the name is next to it → `aria-hidden`.
- The mark alone, as a link home → the link carries `aria-label="Kasi Zonke Link — home"`.
- Mark alone, not a link → add a visually hidden "Kasi Zonke Link" beside it.
- Never put the brand name in `alt` text twice on one surface.

---

## 7. Landmines

Four things look like branding. Two are not, and one is a shared format you must not change
alone.

### Order numbers still start with `FF-`

Order numbers are generated as `` `FF-${Date.now().toString().slice(-6)}` `` and appear on
every order, receipt and support ticket a customer sees. `FF` is ForkFleet — genuinely a stale
brand prefix.

**Do not change it in one app.** All three apps read and display these, and at least one
derives a fallback order number from the same format. Changing the prefix in isolation breaks
matching between the consumer app and the consoles.

If the prefix should become `KZ-`, it is a coordinated change across all three repos plus a
decision about existing `FF-` orders, which keep their numbers forever. Raise it; do not action
it from this document.

### `ForkFleet` in backend config is correct

The Firebase project genuinely is ForkFleet. Leave it in code comments, config and the Firebase
app instance name. Only replace it where a **user** reads it.

### Seed restaurants still named "Hearth"

The customer app's seed catalogue contains restaurants called *Hearth Grill & Smokehouse* and
*Hearth Artisan Kitchen*. They no longer collide with the app's name, but they are now the
last place a customer reads the word Hearth.

Renaming them changes their slugs, which breaks any saved cart or order pointing at them. Worth
doing deliberately, with a redirect — not as a side effect of a branding pass.

### Do not redraw the mark

If you generate the flame from a description instead of copying the path, you will get a
different flame. Then the three apps have three logos, which is the problem this document
exists to end.

Copy the path string. Diff it against this document if in doubt.

### Other things not to do

- Do not add a stroke, gradient, shadow or animation to the mark.
- Do not create a second mark for the consoles. Staff tools share the consumer mark.
- Do not point `twitter:site` at the build platform. If there is no product account, omit the
  tag rather than misattribute it.
- Do not introduce a new accent colour. `#fb4500` is the only brand colour.

---

## 8. Acceptance checklist

Work through this in your repo. Every box applies to all three apps.

**Assets**

- [ ] `favicon.svg`, `logo-mark.svg`, `logo-wordmark.svg`, `site.webmanifest` copied into `public/`
- [ ] The flame path in your code is byte-identical to the path in §3
- [ ] `fill-rule="evenodd"` present — the mark has a visible hole, not a solid blob
- [ ] Shared logo component exports a mark, a badge and a full lockup
- [ ] The mark uses `currentColor`, not a hardcoded fill (except in `favicon.svg` and the crash page)

**Name**

- [ ] No `Hearth`, `ForkFleet`, `forkfleet`, `Flavor Finder` or `Orderly Hub` in any string a user reads
- [ ] Page titles follow `<Page> — Kasi Zonke Link`
- [ ] Manifest `name` and `short_name` set
- [ ] No social handle pointing at the build platform

**Placement**

- [ ] Browser tab shows the flame, SVG first with `.ico` as `alternate icon`
- [ ] Desktop nav shows mark + wordmark and links home
- [ ] Mobile header shows the mark
- [ ] Sign-in screen shows the mark
- [ ] 404 and client error screens show the full logo
- [ ] Server crash page shows the inlined mark on `#fcfaf7`
- [ ] `theme-color`, `application-name`, `apple-mobile-web-app-title` all set

**Checks that catch the usual mistakes**

- [ ] The mark renders at 16px and the hole is still visible
- [ ] The mark is legible on `#fcfaf7` and on `#fb4500`
- [ ] Hard refresh confirms the new tab icon — browsers cache favicons hard
- [ ] Every asset serves 200 with `content-type: image/svg+xml`
- [ ] `site.webmanifest` serves as `application/manifest+json` and parses

**Deliberately not done**

- [ ] Order number prefix left as `FF-` — flagged, not changed
- [ ] `ForkFleet` left in backend config and comments — correct there
- [ ] `localStorage` keys left on the `hearth.*` prefix — renaming wipes every saved cart, address and order
- [ ] Seed restaurants and the `HEARTH50` coupon left alone — renaming breaks slugs and a live code
- [ ] `og:image` still missing until someone exports the 1200×630 PNG

---

## 9. Open question

The console names in §2 (**Kasi Zonke Admin**, **Kasi Zonke Kitchen**) are a proposal, not a decision.
If Orderly Hub should keep its own name, say so — the mark and colours still apply either way.

If anything else here does not fit your app, raise it rather than improvising a variant. A
second flame is worse than an open question.

---

*Prepared as a handover reference — update alongside any future change to the name, the mark or
the brand palette.*
