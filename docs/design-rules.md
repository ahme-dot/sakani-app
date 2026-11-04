# Sakani design rules

These rules are for anyone adding or changing a screen. They come from the full-site review of 2026-11-04. `tests/design.spec.ts` checks most of them automatically.

## Screen sizes to check

Check every new screen in Arabic and English at these four sizes:

| Size | Width × height | Why |
|---|---|---|
| Phone | 390 × 844 | Most guests. |
| Tablet | 768 × 1024 | Below 900px the header search becomes a single bar. |
| Laptop | 1093 × 520 | A 1366×768 laptop at 125% zoom. It's the most common small screen, and it's very short. |
| Desktop | 1440 × 900 | The page width stops growing at 1440px. |

Nothing may scroll sideways. On the laptop size, the main action (for example "Book", "Save" or the first listing row) must be visible without scrolling far.

## Colours

| Use | Colour | Notes |
|---|---|---|
| Main text, headings | `#14213d` (navy) | |
| Secondary text | `#46546b`, or `var(--muted)` | Never lighter than this for text people need to read. |
| Brand, links, chosen items | `#1f7a5a` (green) | Darker green `#17604a` on hover. |
| Light green background (hover, chosen row) | `#eef4f1` | |
| Lines and borders | `#e3e7ec` | |
| Errors | `#b42318` for text and outlines | Light red background `#fbebeb`. |
| Disabled | `#7d8794` | Only for things that can't be used. |

Text must reach WCAG AA contrast: 4.5:1, or 3:1 for text that is at least 24px, or 18.66px and bold. That includes text on the light grey and light green boxes, where a grey that passes on white often fails. `tests/design.spec.ts` runs axe for this.

## Text

- **Fonts:** Cairo for Arabic, Inter for English. Georgia is only for page titles (the `h1` on home, host, sign-in, legal and admin pages) and the listing section titles.
- **Minimum sizes:**
  - 13px for anything people read.
  - 16px for anything typed into on a phone, so the phone doesn't zoom in.
- **No ALL-CAPS headings or labels.** The only exception is the small green kicker above English section titles.
- **Dates:** written in words in the page language, for example «الخميس، 26 نوفمبر 2026» or "Thursday, 26 November 2026". Never 11/26/2026.
- **Numbers:** Western digits in both languages (`ar-EG-u-nu-latn`).

## Shapes

| Element | Corner radius |
|---|---|
| Buttons, chips, the search bar | 999px (pill) |
| Inputs and small buttons | 10px |
| Cards, lists, the calendar | 14px |
| Big panels and modals | 16–20px |

## Form controls

**Dropdowns:** always use `components/sakani-select.tsx` (`<SakaniSelect>`), never a bare `<select>`.

- It keeps the real select, so `name`, `value`, `required` and `onChange` work as usual.
- On a computer it opens the Sakani list. On phones the phone's own picker opens.
- Every dropdown shows one arrow on the reading side's end. You don't need to add your own.

**Dates:** always use `components/sakani-date.tsx` (`<SakaniDate>`), never `<input type="date">`.

- It accepts the same props as the date input, including `min`, `max` and `required`.
- On a computer it shows the date in words and opens the Sakani calendar. Weeks start on Saturday, and days outside `min`/`max` are closed.

**Header search:** `components/search-select.tsx` is its own pill-shaped version.

**File uploads:** a normal `<input type="file">`. Its button is styled globally.

**Phone tap targets:** at least 40px high.

## Listing cards

- The grid places as many cards as fit, at least 224px each:
  - 4 per row on a 1024–1366 laptop
  - 5 per row on 1440 and wider
  - 3 per row on a tablet
  - 1 per row on a phone
- Photo ratio: 4:3, or 3:2 on phones.
- Titles stop at two lines. The price sits at the bottom so cards in a row line up.
- Card images use `sizes="(max-width: 760px) 100vw, (max-width: 1023px) 50vw, (max-width: 1599px) 25vw, 20vw"`, so phones and laptops download smaller photos.

## Lists, menus and calendars that open

- They're drawn at the page root (a portal). A modal or a table that scrolls can't cut them off.
- They open below the field, or above it when there's no room below, and are never taller than 320px.
- They close on Escape, on a click outside, and on scroll. Escape closes only the list, not a modal around it.

## Accessibility

- Everything works by keyboard. Anything that scrolls on its own (photo strips) can take focus and moves with the arrow keys.
- Focus is always visible: a 2–3px green outline.
- Animations stop when the visitor's system asks for reduced motion.

## The stylesheet

`app/globals.css` grew in layers, and later sections override earlier ones. When you change a component:

- Change its last block. Search for the component's class, and the newest rule wins.
- Don't add yet another override at the end.
- The newest blocks are marked `==== … 2026-11-04 ====`: dropdowns, calendar, cards, contrast, tablet header.
