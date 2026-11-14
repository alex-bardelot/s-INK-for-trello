# Keeping s-INK links attached to moved note elements

Status: study plus a diagnostic button (0.26.0). The tracking itself is
not implemented yet.

## Problem

An s-INK link is a picture (the app icon) plus a text box. The text box
reads the card or board name and `s-INK/c/{shortLink}` or
`s-INK/b/{shortLink}`. Both elements also hold that string in their
`userData`. After a link text box was moved, most likely with the lasso,
its `userData` came back empty. The link was still found, but only
through its visible text.

That fallback works for text boxes. It cannot work for the next feature:
**binding handwriting to a card or board**. The user lassos a few
handwritten words and links them to Trello. Strokes have no text, so the
link must live in data that survives a lasso move, resize or copy.

## What the SDK offers (sn-plugin-lib 0.1.65)

Sources:

- the typings in `lib/typescript/src`;
- the implementation in `src` and `lib/module`;
- the host keys in `android/.../constant/paramkey/TrailKey.java`;
- docs.supernote.com: Element type, Links guide, Lasso guide,
  `modifyElements`, `modifyPageElements`, `registerEventListener`.

### Element identity

| Field | What it is | Survives a lasso move? |
| --- | --- | --- |
| `uuid` | Key of the element in the plugin-side **native cache**. Each `getElements` or `getLassoElements` call creates the entry. `recycle()`, `clearElementCache()` or memory pressure release it. The docs say it does not change across a write call. | No. It identifies a cached copy, not the element in the file. |
| `numInPage` | "Index within the page (starts from 1)". `deletePageElements` and, per the docs, `modifyElements` use it to find an element. | Unknown. If the host moves an element by delete + insert (likely, see `batchUpdatePageElements`), it gets a new index. |
| `trailNum` | **Not in the TS typings**, but a host key (`TrailKey.TRAIL_NUM`, "Stroke ID"). Native links and titles point to their strokes with `controlTrailNums`, so this id must outlive a move, or native stroke links would break. | Probably yes. It may not reach JS: the diagnostic lists every key the host sends. |
| `userData` | "Custom user data". Nothing in the docs says whether lasso operations keep it. | Lost on a text box (observed). Unknown on strokes and pictures. |
| stroke points | Point data in EMR coordinates (`stroke.points`, a native accessor). | Translated, so absolute values change. |
| `recognizeResult` | Recognition bounding box of a stroke (`up_left_point_*`, `down_right_point_*`). | Unknown. It may be a cheap stroke bbox, if it is filled in. |

There is **no lasso move/modify event**. `registerEventListener` only
supports `event_pen_up`, and the docs list no other event. Since 0.23
the motion listener already gets every touch. A lasso drag cannot be
told apart from other touches, but the plugin can rescan after any
release.

### Native links

`PluginNoteAPI.setLassoStrokeLink({destPath, destPage, style, linkType})`
turns the selected strokes into a **native stroke link**:

- The host stores it as an element of type 600, with `link.controlTrailNums`
  (the ids of the strokes) and `link.destPath`.
- `linkType: 4` (website) takes a URL as `destPath`.
- `style` draws an underline or a frame around the strokes.
- `getLassoLinks` reads native links back, and `modifyLassoLink` changes one.
- The docs say the selection must hold only strokes and geometries from
  the main layer.

The firmware manages these links itself. Moving the strokes must move
the link with them, since this is a built-in feature of the note app.
`hitTest.ts` already reads native links (bounds from `link.X/Y/width/height`,
text from `link.fullText` or `link.destPath`).

Unknowns that only the tablet can answer:

1. What the firmware does when a type-4 link is tapped: it may open a
   browser, ask first, or do nothing in the note app.
2. Whether `destPath` must be an `http(s)` URL, or can be `s-INK/c/{id}`.
3. Whether the link element (and its `destPath`) really follows the
   strokes through a lasso move, resize, copy/paste and cut/paste.

## Recommended approach

### Tier A: native stroke links (preferred)

1. A new lasso button, **"Link to Trello"**, is shown for strokes. In
   the button listener, before `showPluginView()` (the error-904 pitfall
   of `lassoText.ts`), it reads:
   - `getLassoRect()`,
   - `getLassoElements()`, keeping each stroke's `numInPage`, point count
     and fingerprint,
   - the recognized text (`readLassoText`), used as the search term in
     the picker.
2. The view opens a card/board picker. It can be the same search as the
   existing "insert link" flow, prefilled with the recognized words.
3. On selection, the plugin selects the strokes again with
   `PluginCommAPI.lassoElements(savedRect)` and calls
   `setLassoStrokeLink({destPath: 'https://trello.com/c/{shortLink}',
   linkType: 4, destPage: 0, style: 2})`, then `saveCurrentNote()`.
   - A real Trello URL also works outside the plugin, for example when
     the note is opened elsewhere.
   - `parseInkLink` must learn to read `trello.com/c|b/{shortLink}` as
     well as `s-INK/c|b/`.
4. Tap handling stays as it is. A link element (type 600) whose
   `destPath` parses as a Trello link is opened in the plugin.
   `findInkLinks` already covers it, once the parser is extended.

Why this is preferred: the identity is kept by the firmware, not by us.
It needs no registry, the link is visible (dashed frame), and it is the
same mechanism users know from note-to-note links.

Risks:

- The firmware's own reaction to the tap may compete with ours (a
  browser opening on top of the plugin). If so, use a **pen** trigger for
  ours and accept the firmware's finger behaviour, or fall back to tier B.
- `lassoElements(rect)` may fail while the plugin view is shown. Then
  close the view first (`closePluginView()`), lasso, link, and only show
  a confirmation in the log/toast.

### Tier B: plugin-side `userData` plus fingerprint registry (fallback)

Use this if native links cannot carry a Trello target, or if their tap
cannot be shared.

- **Binding**: write `userData = s-INK/c|b/{id}` on every selected
  stroke with `PluginCommAPI.modifyPageElements(lassoElements, page)`.
  Pass the objects returned by `getLassoElements` / `getElements`, so
  the uuid stays valid.
- **Fingerprint** per stroke (`strokeFingerprint` in
  `src/inkLink/elementProbe.ts`): `n{pointCount}:{shapeHash}:{w}x{h}`.
  - The shape hash quantizes 8 evenly spaced points to a 16×16 grid
    relative to the stroke's bbox. It is the same after a move, and after
    a uniform resize (only `{w}x{h}` changes).
  - A link made of k strokes is matched when most of its fingerprints
    (say ≥ 60 % by `n:shape`) are found on the page, which tolerates an
    erased or added stroke.
  - Text boxes need no fingerprint: their text already holds the link.
- **Registry**: per note and page, `{target, fingerprints[]}`.
  - Compact form: `c/{shortLink}=n42:1a2b3c4d,n17:…`. A shortLink is
    8 characters, and a fingerprint without its size is about 13, so a
    3-word link (~20 strokes) is ~280 bytes.
  - `directoryStore` falls back to one directory entry per 180 encoded
    characters when AsyncStorage is missing. That is about 2 entries
    per link, so tens of links per note stay manageable. Hundreds do not.
  - Key the registry by the note path (which changes on rename; also
    keep a fallback lookup by fingerprint only) and drop entries whose
    note has disappeared.
- **Self-healing**: on a tap, `getElements` returns the page.
  - Strokes with a valid `userData` are used as they are.
  - When a registry entry matches strokes that lost their `userData`
    (moved), the plugin writes it again with `modifyPageElements` and
    updates the registry's page index.
  - To keep taps fast, filter first by point count (`points.size()`, one
    native call) and read points only for candidates.
- **Hit test on handwriting**: the bbox of the linked strokes, in EMR
  coordinates (from the points, or from `recognizeResult` if the host
  fills it), is converted to screen pixels with
  `PointUtils.emrPoint2Android`, like pictures today. Then it is merged
  into one rect per link. `findInkLinks` takes these rects next to text
  boxes, native links and pictures.

Tier B costs more: point reads on every tap, a registry that can grow
stale, and links that are invisible unless we draw a frame. It is the
fallback, not the plan.

## Diagnostic to run on the tablet

Version 0.26.0 adds a lasso button **"s-INK: Inspect"** (NOTE only, shown
for strokes, text, pictures and links). It never opens the view. It
writes to the s-INK log in **Settings > About**, which now keeps 60 lines,
newest first:

- `inspect: page P, N elements, lasso {rect}, L native links`
- `inspect: keys …`: every top-level key of the first element, which
  shows whether `trailNum` reaches JS.
- `inspect #i: type T, num N, trail X, uuid …, ud "…", pts P, emr l,t-r,b,
  fp n…, rec …, text …, pic …, link …`, one line per element (max 12).
- `inspect link: {…}`: up to 3 native links from `getLassoLinks`.
- If **no** selected element has `userData`, it tags them with
  `s-INK/diag/{hhmmss}-{n}` (no link: the tap parser ignores it) through
  `modifyPageElements`, saves the note, and logs `inspect: tagged …,
  modify …, save …`.

Steps:

1. **Strokes, control.** Write a word. Lasso it, press *Inspect*, which
   tags it. Tap outside to deselect, lasso the same word again, and
   press *Inspect*. Expect `ud "s-INK/diag/…"`. If it is empty, the host
   does not keep `userData` on strokes at all, and tier B needs the
   registry for every lookup.
2. **Strokes, move.** Drag the lassoed word elsewhere, deselect, lasso it
   again, and press *Inspect*. Compare `num`, `trail`, `uuid`, `ud`, `pts`
   and `fp` with step 1. The fingerprint must stay the same, and `emr`
   must be shifted.
3. **Resize** the word with the lasso handles, then **copy/paste** it,
   and inspect again each time.
4. **s-INK link text box and icon**: lasso an existing s-INK link and
   repeat steps 2 and 3 (its `userData` is already set, so nothing gets
   tagged).
5. **Native stroke link**:
   - Lasso a word and use the note app's own *Link* action, choosing a
     website if the firmware offers it (otherwise a note page).
   - Inspect it, move it, and inspect it again: does the type-600 element
     keep `destPath`, and do `controlTrailNums` still list the strokes'
     `trail` ids?
   - Tap the link with the finger and with the pen. Note what the firmware
     does, and what the s-INK log shows for the tap.
6. Copy the log lines (or take a photo of the screen) and report them.

## Open questions only the tablet can settle

1. Does a lasso move keep `userData` on strokes and pictures, or does it
   drop it on every element type? Is it a delete + reinsert (new `num`)?
2. Does `trailNum` reach JS, and is it stable across a move?
3. Is `recognizeResult` filled in for strokes, so it could stand in for
   a bbox without reading points?
4. What does a tap on a type-4 native link do in the note app, and can
   `destPath` be a non-URL string?
5. Does `lassoElements(rect)` select again from a running plugin view
   (needed for `setLassoStrokeLink` after the picker)?
6. Does `modifyPageElements` on lasso elements work while the lasso is
   still active (the diagnostic logs its result)?

## Next steps

- Once the device answers come back, choose tier A or B.
- Remove (or hide behind a setting) the *Inspect* button before a public
  release.
