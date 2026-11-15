# Release notes

All notable changes to this project are listed here, one entry per commit,
newest first.

## 0.52.3 — One waiting box everywhere

- Every wait of the plugin now shows the same box: a framed message in
  the middle of the page, with three squares that fill in one by one,
  once a second. Only the message changes:
  - **Looking for your Trello account…** when the plugin opens;
  - **Opening the s-INK link…**;
  - **Loading the board…**;
  - on the New Trello Card page, **recognizing**, **Loading…** and
    **Creating the card…** (still over the page).
- Short waits shown in place, inside a button, a list row or a card's
  footer, stay as they were.

## 0.52.2 — Opening message in a box

- **Opening the link…**, shown while an s-INK link opens, now stands in
  a small framed box in the middle of the page, like the popups of the
  New Trello Card page.

## 0.52.1 — s-INK card links open straight on the card

- Tapping an s-INK link to a card showed its board first, then the card
  over it: a flash on E Ink. The **Opening the link…** message now stays
  until the card is ready, which then shows at once; its board is still
  underneath, for the back button.

## 0.52.0 — Creation popup, then the card's board

- While the card is being created, the New Trello Card page stays on
  screen under a **Creating the card…** popup. Below the message, three
  squares fill in one by one, once a second, to show the work goes on:
  no faster, to spare the E Ink screen.
- Once created, the card's board opens where the card is: its list
  comes first on the page of lists, and that list shows the page of
  cards that holds it. The whole board is shown for this opening, even
  if Focus or Review mode is on; choosing a mode goes back to it.
- If the checklist could not be added, or the selection could not be
  linked to the card, the popup says so, with an **Open the board**
  button. The page that followed creation, with its **Close** button,
  is gone.
- An s-INK link to a card now also opens its board at the card's page,
  under the card it opens.

## 0.51.1 — Icon column on the New Trello Card page

- The block icons now stand in a column on the left of the page; the
  titles, chips and fields of each block all start after it, at the
  same place.
- **Labels** and **Members** lose their title: their icon stands on the
  line of the chips, which follow it on the right. Accessibility
  services still read the block's name on the icon.
- The labels icon is now a price tag as on Trello: rounded at one end,
  pointed at the other, with its hole near the tip, which points up
  right.

## 0.51.0 — Block icons on the New Trello Card page

- Each block of the New Trello Card page has an icon before its title,
  to find it at a glance: a board for **Board**, a bulleted list for
  **List**, a tag for **Labels**, a person for **Members**, a T for
  **Title**, a paragraph for **Description** and a ticked box for
  **Checklist**.
- The icons are drawn by the plugin, with the same line weight as its
  other icons; they do not depend on the tablet's fonts.

## 0.50.3 — One separator on the New Trello Card page

- The headings of the New Trello Card page (Labels, Members, Checklist)
  are no longer underlined.
- A single line now separates where the card goes and how it is tagged
  (Board, List, Labels, Members) from what it says (Title, Description,
  Checklist).

## 0.50.2 — Steady chips on the New Trello Card page

- Label and member chips keep the same size whether added (solid frame,
  ×) or not (dashed frame, +): same height, same frame thickness, and
  the same room for the + and the ×. Adding or removing one no longer
  moves the others.
- The buttons that open the list of all labels or members are now a
  dashed **+**, as high as the chips, instead of **+ Label…** and
  **+ Member…**.

## 0.50.1 — Lasso buttons that always answer

- Reported on the tablet: **New Trello Card** and **Insert Trello Link**
  did nothing again, after working only now and then for a few versions.
- The plugin's button listener, which the lasso buttons depend on, is now
  set up first thing at startup. It no longer waits for the tablet to
  accept the buttons.
- Button registrations run one at a time. A language change no longer
  removes and adds the buttons again when their labels stay the same,
  and two quick changes can no longer overlap, which could leave a
  button registered twice or missing.
- If the lasso selection cannot be read within 5 seconds, the plugin
  view opens anyway instead of staying closed.
- Diagnostics keeps the last 30 button presses and what followed
  (`button`, `card:`, `bind:` lines) apart from the pen releases, which
  used to push them out of the log while writing. **Clear** empties
  them; each opening of the view is logged (`showing the view`,
  `view shown`).

## 0.50.0 — Suggested labels and members, and New card settings

- On the New Trello Card page, **Labels** and **Members** no longer list
  everything the board has: only the 3 used most on new cards of that
  board are shown (ties going to the one used last), followed by a
  **+ Label…** or **+ Member…** button. It opens a list of them all,
  floating under the button, where a tap adds or removes one; a tap
  elsewhere, or scrolling, closes it. Those added from the list show as
  chips too.
- Labels and members are counted per board each time a card is created,
  to rank the suggestions.
- The connected member is assigned to each new card by default; the chip
  can be removed before creating the card.
- New **Settings › New card** category:
  - **Labels and members suggested**: none, 3 or 5;
  - **Assign me to new cards** (on by default);
  - **Link the selection to the new card** (off by default): once the
    card is created, what was circled with the lasso becomes an s-INK
    link to it, with its line, as with **Insert Trello Link**. The last
    page says whether the link was made.

## 0.49.7 — Lighter Title and Description

- On the New Trello Card page, **Title** and **Description** are no
  longer underlined: the framed field below each one is enough. Labels,
  Members and Checklist keep their line.

## 0.49.6 — Lasso buttons registered at once

- Reported on the tablet: **Insert Trello Link** and **New Trello Card**
  still did nothing, while the sidebar button opened the plugin. The
  lasso buttons depend on the plugin's own button listener, which was
  registered only after the language saved in Settings was read from the
  tablet; if that read stalls, the lasso buttons get no answer.
- The buttons and their listener are now registered as soon as the
  plugin starts, in the system language; the labels switch to the
  language chosen in Settings once it is read.
- Diagnostics logs the startup (`startup: plugin started`, `buttons
  registered`, `button listener ready`, `saved language applied`). These
  lines stay at the bottom of the log: the taps logged while writing no
  longer push them out, and **Clear** keeps them.

## 0.49.5 — Network access asked on the connection page

- The Trello connection page asks for network access as soon as it
  opens. It was only asked once a token was entered, while waiting for
  the token sent back through the QR code already needed the network.
- The QR code flow starts waiting for the token once access is granted.
  If it is refused, the page says so, with a **Retry** button that asks
  again.
- Diagnostics logs the answer (`connect: network access granted`).

## 0.49.4 — Only named labels on a new card

- The New Trello Card page no longer offers labels without a name (a
  color alone): only named labels are listed. The color names added in
  0.49.3 for them are gone. A board whose labels have no name shows "This
  board has no labels."

## 0.49.3 — Readable labels, and the list hangs from the board

- On the New Trello Card page, label chips drew unnamed labels as dark
  bars that all looked alike. Each chip now shows a small grey square for
  its color and its name, or, for an unnamed label, the name of its color
  in italics ("Green", "Red, dark"…), in every language.
- **List** is drawn under **Board** with an elbow line from the board
  down to a dot before the list, as on the paper sketch: the list belongs
  to the board.

## 0.49.2 — New Trello Card looks like the tablet's own dialogs

- The card page has the title bar of the tablet's New Task and New Event
  dialogs: black, **Cancel** on the left, **New Trello Card** in the
  middle, **Add** on the right. **Add** is greyed out until the card has a
  board, a list and a title.
- **Add** replaces the button at the bottom of the page; what is missing
  and any creation error now show at the top, next to it.

## 0.49.1 — Lasso buttons no longer hang without note access

- Reported on the tablet after updating to 0.49.0: **New Trello Card** did
  nothing, and Diagnostics had no `card:` line at all. Updating the plugin
  seems to reset its permission to read notes; the lasso button then asked
  for it while the view was still hidden, a prompt that never shows, and
  waited forever. The same happened after 0.48.0.
- **New Trello Card** and **Insert Trello Link** now only check the
  permission, without asking. If it is missing, the view opens at once,
  asks for it there, and **New Trello Card** says to select the text
  again once it is allowed.
- Diagnostics now logs every button press (`button N pressed`) and the
  start of the lasso reading (`card: reading the lasso`).

## 0.49.0 — New Trello Card on a single page

- **New Trello Card** no longer asks for a board, then a list, then shows
  what was recognized: once the handwriting is recognized, one page shows
  the whole card.
- **Board** and **List** are filled in with the ones used last, or with
  the only one available; otherwise the button reads "Choose a board" or
  "Choose a list". A tap on either opens its picker (suggested boards
  first, as before) and comes back to the card.
- **Labels** lists the labels of the board: solid with a × once added to
  the card, dashed with a + while available. A tap adds or removes one.
- **Members** lists the members of the board the same way, the connected
  member first.
- **Title** and **Description** are editable fields.
- **Checklist** has one row per item: a square to tick it, its text, and a
  ⊠ to remove it; "+ Add an item" adds a row. Blank rows are not created.
- Labels and members are sent with the card in the same request. If the
  card cannot be created, the error shows on the page and nothing typed is
  lost. A **Cancel** button closes the view.

## 0.48.2 — Insert Trello Link

- The lasso button **Link to Trello** is renamed **Insert Trello Link**
  (French: « Insérer un lien Trello »), in every language.

## 0.48.1 — New Trello Card responds again

- Reported on the tablet: **New Trello Card** no longer responded. In
  0.48.0 the view was opened while the handwriting recognition had already
  started, and the host does not seem to handle both at once.
- Recognition now starts only once the view is open (the host is given
  3 seconds at most to say so).
- If recognition does not answer within 15 seconds with the view open, it
  is cancelled, the view is hidden, and recognition runs again with the
  note in front, as before 0.48.0; the view opens again on the result.
- Settings › Diagnostics tells what happened (`card: captured …`,
  `card: view opened, recognizing`, `card: recognition stalled …`,
  `card: recognized N chars`).

## 0.48.0 — Checklists from the lasso, and a recognizing popup

- **New Trello Card** reads checkboxes: every line of the selection that
  starts with a square (`☐`, `□`, `▢`, `[ ]`…) becomes an item of a
  checklist named `Check-list`, added to the new card in the same order.
  A ticked or filled square (`☑`, `☒`, `■`, `[x]`…) makes a ticked item.
- The card title is the first line without a square, the description the
  other lines without one.
- The review page has a third field, the checklist, one item per line,
  to fix or complete the items before the card is created.
- If the card is created but its checklist cannot be added, the last page
  says so, rather than offering to create the card again.
- A "Trello card creation: recognizing…" popup now shows during the
  handwriting recognition, which takes a while, and closes when it is done.
  The lasso is still read before the view opens (the host drops it once the
  view is shown); only the recognition, which works on the elements already
  read, runs with the view open.

## 0.47.2 — The new link stays selected

- On the tablet, the title of a new card note was selected when the note
  opened (the log reads `lasso … ok after 1 attempt`), then the selection
  went away by itself, probably when the note app finished showing the
  note. A new link or title is now watched for 2.5 seconds after it is
  selected: when the selection is gone, it is made again, three times at
  most (the user may be dropping it). Timers do not fire then, so the
  host is asked again and again.
- The log tells what happened (`lasso kept: … made again N time(s), lost
  at … ms`, or `never lost`).

## 0.47.1 — Card note title lower, and selected

- The title of a card's new note starts at 240 px from the top of the
  page instead of 120, clear of the note app's toolbar (about 115 px
  high), which it touched.
- The title was not selected: the log showed "opened note not current"
  36 s after the note was made, while the wait stops after 5 s. Once
  `openFile` hands over to the note app, JavaScript timers stop firing,
  and the wait (a `setTimeout` between checks) only went on at the next
  touch on the page. The opened note is now awaited by asking the host
  again and again, without timers, for 5 seconds at most; the log gives
  the number of checks and the time (`note: current after …`), or the
  file the host reports as current.

## 0.47.0 — Card notes sorted by board

- A card's note is now `Note/s-INK for Trello/{board name}/{card name}.note`:
  one folder per board, and the note named after the card, with nothing
  added. Characters file systems reject are replaced by spaces; a second
  card of the same name on a board gets `{card name} (2).note`, and so on.
- Since the name no longer carries the card's short link, a card's note
  is found:
  - by the path remembered when it was made (`supertrello.cardNotes.*`);
  - by `{board}/{card}.note` (and its namesakes) when the s-INK link of
    its title points to the card;
  - among the notes of 0.45.x–0.46.x (`Note/s-INK/… [id].note`), kept
    where they are;
  - before a note is made, by reading the title of every card note, so
    that a card or board renamed since keeps its note.
- The shared copy of the link icon moves to
  `Note/s-INK for Trello/.s-INK-icon.png`.
- The help of **Create a note** names the new folders, in all locales.

## 0.46.3 — Link icon drawn, lasso without timers

- The s-INK icon before a link was accepted by the tablet but not drawn:
  its picture was the copy next to the bundle, in the plugin host's
  private folder, which the note app likely cannot read. The icon is now
  copied once to the shared `Note/s-INK` folder (`.s-INK-icon.png`,
  hidden by its dot) and placed from there; the private copy stays the
  fallback. The copy is written to the Diagnostics log (`icon:` line) and
  the icon's path to the `insert:` line.
- Selecting a new link with the lasso no longer waits with `setTimeout`
  once the plugin view is closed: JavaScript timers may stop while the
  plugin is in the background. The lasso is asked again until the host
  accepts it, for 3 seconds at most, and the `lasso` line of the log
  gives the number of attempts.
- A card's new note is awaited while the plugin view still shows; the
  view is closed only then, before its title is selected.

## 0.46.2 — Link in note: centred and selected

- **Link in note** now places the s-INK link in the middle of the current
  page (`layoutCenteredLink`) instead of near its top left corner, then
  closes the plugin view and selects the link with the lasso, so that it
  can be moved at once wherever it should go.
- A card note's title that could only be placed once the note was open
  is selected the same way.
- The lasso selection lives in `closeViewAndSelect` / `selectInkLink`
  (`noteBridge.ts`), shared by both; each selection is written to the
  Diagnostics log (`lasso …` line).

## 0.46.1 — The title of a card note, centred and selected

- The s-INK link that titles a card's new note is now centred across the
  page, near its top (`layoutTitleLink`), instead of sitting at the left.
- When the new note opens, its title is already selected with the lasso
  (`PluginCommAPI.lassoElements`), so that it can be moved at once. The
  plugin view is closed first, since the host drops the lasso while the
  view shows. A note the card already had opens as before, with nothing
  selected.
- The selection is written to the Diagnostics log (`lasso …` line).

## 0.46.0 — Template of the card notes

- New **Note template** section in Settings > Start work (shown while
  **Create a note** is on): templates as tiles, each with a small preview
  and its name, the chosen one framed thickly and ticked:
  - **Blank page**, the page packaged with s-INK (the default);
  - **My templates**: the PNG images of the tablet's `MyStyle` folder,
    where Supernote keeps the templates the user adds;
  - **Supernote templates**: the tablet's own (ruled lines, grids, dots,
    Cornell…), named after their identifier (`style_8mm_ruled_line` →
    "8mm ruled line"), previewed in the orientation the tablet is held in.
- A card's note uses the chosen template:
  - a template of `MyStyle` is given to `createNote` as a file;
  - a Supernote template is first given by name; if the host refuses it,
    the note is made from the blank page, a page with the template is
    inserted (`insertNotePage`) and the blank page is removed;
  - if the chosen template cannot be used (a file removed from the
    tablet, for one), the note gets the blank page and the card's report
    says so, with the reason, instead of opening the note at once.
- Each step (template chosen, each attempt and the host's answer, pages
  and their templates after the insertion, page removed) is written to the
  Diagnostics log (`note:` lines).
- New `startWork.template*` strings in all locales.

## 0.45.1 — Card notes get a blank page template

- Creating a card's note failed on the tablet with error 802 "Background
  template file does not exist!": `createNote` needs a template file, not
  the `android.resource://` URI the host lists for its templates. Blank
  page templates at the Manta's screen size (`assets/blank-page-portrait.png`,
  1920 × 2560, and `blank-page-landscape.png`) now ship with the plugin and
  are tried first; the host's URI and the bare template name stay as
  fallbacks.
- When the note cannot be created, the card's report gives the reason
  (the failing step and the host's answer), as "(Detail: …)".
- More `note:` lines in the Diagnostics log: the note permissions (read
  and write), the folder and whether it could be made, each packaged
  template and whether it is found, each `createNote` attempt with its
  answer and whether the file exists afterwards.
- Looking for a card's note before the `Note/s-INK` folder exists is no
  longer logged as a failure.
- New `startWork.failureDetail` string in all locales.

## 0.45.0 — Start work on a card

- A **Start** button in the title bar of a card begins work on it. It is
  only offered on boards the member can edit (not as an observer, nor on
  public boards they do not belong to).
- What Start does is set in a new **Start work** category of Settings,
  each action with its own switch:
  - **Assign me to the card**, if the member is not on it yet;
  - **Remove labels** and **Add labels**, each with its own list of label
    names (`TODO` removed and `WIP` added by default), edited as chips that
    are tapped to take them out, and a field to add one. Names are matched
    without regard to case; a label the board does not have is created on
    it, without a color; a label both removed and added stays;
  - **Move the card** to the top of the list of a given name (off, and no
    list, by default);
  - **Create a note**: a note for the card in the `Note/s-INK` folder of
    the tablet, named after the card and ending with its short link
    (`Fix the login [AbC123xy].note`), with the card's s-INK link at the
    top of its first page as a title.
- Each Trello change is its own request: one failing does not stop the
  others. When all went well, the note opens at once; otherwise a report
  on the card lists what was done and what failed (a list name missing
  from the board, for one), with a button to open the note.
- A **Note** button on the card opens its note again. Notes are found by
  the short link at the end of their name, so a renamed card keeps its
  note. Looking for it never asks for a permission.
- New `TrelloClient` calls: `getBoardLabels`, `addCardMember`,
  `addCardLabel`, `removeCardLabel`, `createCardLabel` and `moveCard`;
  the card detail now carries its `idBoard`.
- s-INK links can now be placed in a note file that is not open
  (`insertInkLinkInNoteFile`); if the host refuses, the title is placed
  once the note is open. Note creation steps are written to the
  Diagnostics log (`note:` lines).
- New `startWork.*` and `settings.startWork` strings in all locales.

## 0.44.2 — Offline button: the icon alone

- The **Offline** button of the title bar is now the light Wi-Fi sign
  alone, borderless and as large as the other header icons (like the
  refresh arrow it stands in for). "Offline" is only read out by
  accessibility services.

## 0.44.1 — Light Wi-Fi sign

- The **Offline** button, the offline popup and the offline page show the
  Wi-Fi sign like the tablet does when its Wi-Fi is off: the three thin
  arcs and the dot in light grey (new `colors.wifiOff`), no longer
  crossed out.

## 0.44.0 — Offline button in the header

- While the tablet has no internet, an **Offline** button with a Wi-Fi
  off sign (thin arcs over a dot, crossed out, like the tablet's own Wi-Fi
  sign) stands in the title bar: next to **Settings** on the boards page,
  in place of the refresh arrow on a board. It replaces the black strip.
- Pressing it checks the internet again. If the tablet is still offline, a
  popup says "Your tablet must be connected to the internet. Turn on its
  Wi-Fi, then try again." with an **OK** button. The popup is drawn in the
  page, with no system dialog. **Retry** on the offline page shows it too.
- Once the internet is back, the button goes away, the refresh arrow comes
  back, and boards that had failed to load are loaded again by themselves.
- New `offline.button`, `offline.popupTitle`, `offline.popupMessage` and
  `common.ok` strings in all locales; the strip's strings are gone.

## 0.43.2 — No background internet checks

- To spare the battery, the tablet's internet is no longer checked every
  5 seconds while offline. It is checked when s-INK opens, when a page is
  shown while offline, when **Retry** is pressed, and when a Trello
  request gets no answer. Online, arriving on a page checks nothing.
- The texts no longer promise an automatic return: the strip says "Check
  its Wi-Fi", and the offline page "Once the Wi-Fi is back, press Retry
  to open your boards", in all locales.

## 0.43.1 — Offline means the tablet has no internet

- Offline now means that the tablet itself has no internet, not that
  Trello does not answer. The check uses a neutral address (Cloudflare's
  small trace page, which carries no user data) instead of the Trello API.
  When a Trello request gets no answer, s-INK checks the tablet's
  internet; if it works, only Trello is unreachable and the usual
  "Trello could not be reached" errors are shown.
- The tablet's internet is checked each time s-INK opens, signed in or
  not, so the strip shows at once (only once network access is granted:
  the check never asks for it).
- The strip and the page now say **No internet**: "The tablet is not
  connected to the internet. Check its Wi-Fi", in all locales.
- Tests never reach the internet (`jest/noNetwork.js`).

## 0.43.0 — Offline mode

- Opening s-INK without internet no longer looks like a lost account:
  instead of the connection page, a **No internet connection** page says
  that the tablet cannot reach Trello and that the Trello account stays
  linked. It has a **Retry** button, and s-INK checks the connection every
  5 seconds and opens the boards by itself once it is back.
- On every other screen, a black **Offline** strip under the title bar
  explains why Trello does not answer, and goes away by itself once the
  connection is back.
- There is no network-state API in a plugin: every Trello request now
  tells a shared monitor (`src/network/connectivity.ts`) whether it got an
  answer, and while offline the monitor sends a light `HEAD` request to
  the Trello API to notice the return of the connection.
- New `offline.*` strings in all locales.

## 0.42.4 — The plugin stays open when the browser opens

- Back to the behaviour of 0.42.2: **Open in browser** and **Open Trello
  directly** no longer close the plugin view, and the connection is no
  longer kept aside for when s-INK reopens.

## 0.42.3 — The browser comes over the plugin

- **Open in browser** and **Open Trello directly** did open the browser,
  but the plugin view stayed drawn over it. The view now closes once the
  system has opened the browser.
- The connection is kept meanwhile: reopening s-INK goes back to the
  connection page, with the same relay session (the token the browser
  deposited is picked up at once) and the same stay-connected choice. It
  is forgotten once signed in, on Back, or after the relay's 10 minutes.

## 0.42.2 — Open in browser: feedback and diagnostics

- **Open in browser** (and **Open Trello directly**) no longer look dead
  when the browser does not open: if the system neither opens it nor
  reports an error within 3 seconds, the "No browser could be opened"
  message is shown.
- Each attempt is traced in the Diagnostics log (`browser: …` lines: the
  host opened, the system's answer, and whether the plugin went to the
  background), to find on the tablet why the browser stays closed. The
  relay address is never logged, since it carries the session key.

## 0.42.1 — ON / OFF on the switches

- Like the Supernote system settings, every switch shows **ON** or
  **OFF** just before its track. New `common.on` and `common.off`
  strings in all locales.

## 0.42.0 — Release notes in Settings > About

- Settings > About shows a **What's new** section with the latest
  release, and an **All release notes** button opening a page with
  every release, newest first.
- These notes come from this file, bundled with the plugin: Metro and
  Jest import `.md` files as text (`markdownTransformer.js`,
  `jest/markdownTransform.js`). `src/settings/releaseNotes.ts` reads the
  entries, bullets and bold or code spans; covered by tests, including
  one checking that the newest entry matches the plugin version.
- New strings in all locales. The notes themselves stay in English.

## 0.41.3 — Public add and Trello connect buttons

- In Settings > General > Main page, **Quick add button** is renamed
  **Public add button** and **Quick connect button** **Trello connect
  button**, in all locales.

## 0.41.2 — Board page category

- The **Boards** category of Settings is renamed **Board page**: it only
  holds the settings of an open board (Layout and Mode), next to the
  Main page settings of General. Only the displayed text of
  `settings.boards` changes, in all locales.

## 0.41.1 — Language last in General, choices only

- The **Language** section moves to the end of Settings > General.
- It now shows the choices alone (System, English, Français, ...),
  without the "Interface language" label and help text: the
  `settings.languageInterface` and `settings.languageHelp` strings are
  removed from all locales.

## 0.41.0 — Main page section in Settings

- Settings > General gets a **Main page** section, after Language. It
  gathers the **Quick add button** switch (out of Public boards) and,
  signed out, the **Quick connect button** switch (out of Trello
  account).
- Their help texts are shorter, the section title already saying where
  the buttons are. New `settings.mainPage` string in all locales.

## 0.40.0 — Language setting

- Settings > General starts with a **Language** section: **System**
  (the default) follows the Supernote's language as before; English,
  Français, 日本語, 简体中文 or 繁體中文 fix the plugin's language,
  whatever the system one. Each language is named in itself.
- The toolbar and lasso buttons are registered again in the chosen
  language, as soon as it changes.
- New `LanguageController` (`src/i18n/language.ts`) combining the system
  language and the choice, saved under `supertrello.language`. The
  choice is applied at startup when file access is already granted,
  otherwise when the plugin view opens. Covered by tests; new strings in
  all locales.

## 0.39.1 — Board layout and mode string keys kept

- The `settings.boardLayouts` and `settings.boardMode` string keys are
  back in place of `settings.layout` and `settings.mode`. Only their
  displayed text is short ("Layout", "Mode"), so as not to repeat
  "Boards" inside the Boards category.

## 0.39.0 — General category in Settings

- Settings get a **General** category, first in the list and selected
  when Settings open. It holds the **Public boards** section (with the
  Quick add button) and the **Trello account** section (with the Quick
  connect button), which leaves the Trello category: it is removed.
- **Boards** now only holds the settings of an open board, in two
  sections renamed **Layout** and **Mode**.
- Strings: `settings.general` replaces `settings.trello`;
  `settings.layout` and `settings.mode` replace `settings.boardLayouts`
  and `settings.boardMode`, in all locales.

## 0.38.3 — Settings come back to the Trello category after connecting

- Connecting from Settings > Trello no longer brings Settings back to
  the Boards category: the selected category is kept by `App`, so the
  connection screen returns to Trello. Opening Settings from the boards
  page still starts on Boards.

## 0.38.2 — "Quick connect button" option

- In Settings > Trello, signed out, the switch showing the connect card
  on the boards page is renamed **Quick connect button**, with a short
  help text. It moves out of the connection card and comes before it.

## 0.38.1 — "Quick add button" option

- The switch of the Public boards section is renamed **Quick add
  button**. Its help text now only says that it shows the button adding
  a public board on the boards page.

## 0.38.0 — Option hiding the "+" card on the boards page

- The Public boards section of Settings > Boards ends with a switch,
  **"+" button on the boards page**, on by default. Turned off, the
  boards page no longer shows the "+" card after the public boards;
  they can still be added from the settings. Stored as
  `showAddPublicBoard` in the boards preferences; new strings in all
  locales.

## 0.37.1 — Board mode back in the Boards category

- The board mode is no longer a category of its own: it is the
  **Board mode** section of the Boards category, after Board layouts.

## 0.37.0 — Board layouts and a Board mode category in Settings

- In Settings > Boards, the Supernote Roadmap gets the same bullet as
  the other public boards, and each bullet is now centered on the whole
  row (name and link, or name and help text).
- The **Board view** section is renamed **Board layouts**; its settings
  read **Columns, portrait** and **Columns, landscape**.
- The board mode moves to its own **Board mode** category, between
  Boards and Links, under a new **Default mode** label. The
  `settings.boardView` string is replaced by `settings.boardLayouts`,
  and `settings.boardModeDefault` is added, in all locales.

## 0.36.1 — Bullets before the public boards in Settings

- In Settings > Boards, each public board now starts with a small black
  bullet, centered on its name, so the boards read as items of a list.

## 0.36.0 — Four lists in landscape, with a tablet preview

- In landscape, the board view can now show **4 lists** side by side.
  Portrait stays at 1 to 3. The counts offered and the stored values
  are checked per orientation, so a saved 4 in portrait falls back to
  the default.
- In Settings > Boards, each column setting shows a small drawing of the
  tablet held that way (`TabletPreview`). Inside, the board view shows
  the chosen number of lists, each with a dark header and a few cards.
  It follows the setting as it changes.

## 0.35.0 — Links category in Settings

- The setting for which tool opens s-INK links in notes (finger, pen or
  both) moves from Boards to its own **Links** category, between Boards
  and Trello. New string in all locales.

## 0.34.0 — Settings split into Boards and Trello

- The General category of Settings is split in two:
  - **Boards**: public boards, board view and note links. It opens
    first.
  - **Trello**: the account.
- The `settings.general` string is replaced by `settings.boards` and
  `settings.trello` in all locales.

## 0.33.1 — Inspect lasso button only in diagnostic mode

- The **s-INK: Inspect** lasso button is no longer registered at
  startup. It appears once the Diagnostics category is unlocked (7 quick
  presses on About), and is removed again at the next start.
- Unlocking registers the button right away. A change of system
  language keeps it only while diagnostics is unlocked.

## 0.33.0 — Hidden Diagnostics category in Settings

- The s-INK link log moves from About to a **Diagnostics** category of
  its own in Settings.
- The category is hidden at first. Pressing **About** 7 times in quick
  succession (at most 700 ms apart) shows it and opens it, like
  Android's developer options. It then stays visible until the plugin
  restarts.
- New `RapidTapCounter` helper, with tests. New string in all locales.

## 0.32.1 — Link mode hides the "+" public board tile

- While a lasso selection waits to be linked, the boards page also hides
  the "+" tile that adds a public board. `buildDirectoryRows` has a new
  `showAddPublic` option. An empty Public section is left out entirely.

## 0.32.0 — Link tabs with a chain icon; link mode shows only boards and cards

- While a lasso selection waits to be linked, the boards page hides the
  "Connect your Trello account" tile and the Settings button.
- The **Link** button of board and card tiles is now a tab that hangs
  from the tile's top edge, at its right, like a folder tab. It is black
  with a chain icon (a new `ChainIcon`, drawn with views).
- On card tiles, the tab sits at the top of the card instead of beside
  the title. The labels, or the title when there are none, keep room
  for it.

## 0.31.3 — No more endless "Opening the s-INK link…"

- On the device, linking a selection could leave the view stuck on
  "Opening the s-INK link…". The press on the lasso **Link to Trello**
  button was also seen as a tap on the link under it.
  - That tap started opening the link, then the button replaced the
    request.
  - The cancelled request never reset the screen.
- A replaced request now resets the opening screen.
- The opening screen has a back button.
- Taps open no link while a lasso selection is shown.

## 0.31.2 — s-INK label raised above the line

- The drawn `s-INK/c|b` label now stands 14 px above the line instead
  of 6 px. On the device, it almost touched the line.

## 0.31.1 — Find the drawn mark segments by their points

- On the device, the 27 segments of a mark were inserted (the page went
  from 73 to 100 elements), but none was found after the page's last
  number, so the link was not written again on them.
- They are now found by their two points, within 2 px. Only those
  without the link get it written again.
- The log shows how many were found and how many lacked the link. If
  none is found, it also shows the stored points of a sample geometry.

## 0.31.0 — s-INK label drawn with lines, so it moves with the word

- On the device, a lasso move took the word and its line but left the
  `s-INK/c` text box behind. The label is now drawn with line segments
  (geometry elements), like the line under the word. A small built-in
  stroke font covers `s`, `-`, `I`, `N`, `K`, `/`, `c` and `b`.
  - The letters are 24 px high, black, pen width 200.
  - They stand 6 px above the line, 10 px after the word, and the line
    ends with them.
- Every segment holds the link in its `userData`. The new elements are
  found as those placed after the page's last element.
- Linking a marked selection again deletes its old mark and draws a new
  one, so the label follows the target. Old marks from 0.28 to 0.30
  (gray line, text box label) are replaced the same way.
- The lines of a mark also count in the tap zone (geometry points).

## 0.30.2 — s-INK label closer to the word, shorter line

- The letters of the `s-INK/c|b` label now start 6 px after the linked
  selection. Before, the label's box started there and its inner margin
  pushed the letters further away.
- The label's box is fitted to its letters. A box much larger than its
  text was easily left out of a lasso, so the label stayed behind when
  the word moved.
- The line is shorter: it ends at a narrower estimate of the letters.

## 0.30.1 — s-INK label rests on the line

- The `s-INK/c|b` label of a linked selection is lowered by its text
  box margin and line spacing, so its letters rest on the line instead
  of floating above it.
- The line now stops at the end of the label's letters. It uses a
  narrower glyph estimate than text boxes, closer to the device font.
- The label font grows from 28 to 32.

## 0.30.0 — Linked selections marked with a bold line and an s-INK label

- The line under a linked selection is now black and twice as thick
  (pen width 400). It runs past the selection to a small label:
  `s-INK/c` for a card, `s-INK/b` for a board. The label stands where the
  note app draws its chain icon.
- The label is a text box that holds the link in its `userData`, like
  the line.
- Linking an already marked selection again keeps its mark and updates
  its label to the new target.

## 0.29.0 — Link a selection straight from the board and card tiles

- After the lasso **Link to Trello** button, every tile gets a **Link**
  button:
  - on each board tile of the boards page (the Supernote roadmap
    included), it links the selection to that board;
  - on each card tile of a board, it links the selection to that card.
  A tap elsewhere on a tile still opens it.
- The band at the top now explains this.
- Board cards are read with their `shortLink`, so links to cards stay
  short.

## 0.28.0 — Linked handwriting is underlined

- **Link selection** now draws a dark gray line under the linked
  elements, like the note app's own links.
  - The line is a geometry element (`straightLine`, screen pixels). It
    holds the link in its `userData`, so it moves and copies with the
    selection.
  - A selection that already holds such a line keeps it and gets no
    second one.
- The log shows the line's ends and how the host stored them, to check
  the placement on the device.

## 0.27.0 — Link handwriting to a Trello card or board

- New lasso button **"Link to Trello"**, for handwriting, text and
  shapes.
  - It opens the boards view under a band that explains the next step,
    with a Cancel button.
  - On a board or a card, **Link selection** writes `s-INK/c|b/…` into
    the `userData` of the selected elements, then saves the note.
  - The link stays when the elements are moved or copied with the lasso.
- Tapping linked handwriting opens its card or board.
  - The hit zone of a stroke comes from its recognition box.
  - Nearby elements of the same link form one zone; copies placed apart
    stay separate.
- Links inserted with **Link in note** get their `userData` written
  again with `modifyPageElements`, so it is kept when the link is moved.
- `docs/ink-link-tracking.md` now records the device results. Tapping a
  native website link opens the browser, so native links are not used.
- New strings in all locales.

## 0.26.2 — s-INK link taps: log the page's native links

- Each tap now logs the native links on the page (type 600), up to 3.
  They are logged whatever their target: today a link to a website does
  not show, because it is not an s-INK link.
- The goal is to see what the note app stores for a link to a website
  (`destPath`, link type, bounds).

## 0.26.1 — s-INK link taps: log every outcome and never stay blocked

- On the device, accepted taps wrote no outcome line in the s-INK log.
- Each tap now logs `reading the page` when it starts.
- A tap now logs when it finds no open note page, or when it is skipped
  because the previous tap is still running.
- A tap that hangs for more than 5 seconds no longer blocks the
  following taps.

## 0.26.0 — Lasso diagnostic for keeping s-INK links on moved elements

- New design note `docs/ink-link-tracking.md`. It covers what the SDK
  keeps when the user moves elements with the lasso (`uuid`, `numInPage`,
  the host's hidden `trailNum`, `userData`, native stroke links). It
  recommends native stroke links to Trello URLs for handwriting, with a
  fallback: `userData` plus a move-invariant stroke fingerprint registry
  that heals itself.
- New diagnostic lasso button **"s-INK: Inspect"** (NOTE). It logs the
  selected elements to the s-INK log in Settings > About, one line each:
  - type, in-page number, `trailNum` when the host sends it, `uuid`, and
    `userData`;
  - stroke point count, EMR bounds and fingerprint;
  - recognition box, text box, picture and native link data.
  If no selected element carries `userData`, it tags them with a
  non-link `s-INK/diag/…` value, to see whether it survives a move. The
  log now keeps 60 lines. New string in all locales.

## 0.25.0 — s-INK links: app icon and a hit zone fitted to the text

- A new link now starts with the **app icon** (a picture element, twice
  the 48 px icon), followed by a text box holding the name and the link;
  the `≡`/`▥` glyphs are gone. The icon also holds the link in its
  `userData` and opens it when tapped; its bounds, stored in EMR
  coordinates, are converted to screen pixels with the page size. If the
  host refuses the picture, the text link is kept and the log says so.
- The text box is **sized to its text** (estimated from the font size:
  average Latin glyph width, full width for CJK) instead of a fixed
  1000 px frame, and names longer than 40 characters are cut with an
  ellipsis.
- The **hit zone** follows the visible text: a text box frame is narrowed
  to the estimated size of its text, which also fixes links inserted
  before, and the margin around it drops from 16 to 8 px.

## 0.24.0 — Open s-INK links with the finger, the pen or both

- New **Settings > General > Links in notes** setting: s-INK links open
  with a finger tap (default), a pen tap, or both. A pen tap is detected
  like a finger tap (short and still); the dot it draws stays in the note,
  as the help text says. The choice is saved with the other settings; the
  tap listener reads it at startup when note read access is already
  granted (never prompting while writing), and again whenever the view
  opens. New strings in all locales.
- Diagnostics: a release made with a tool that does not open links is
  logged as ignored, instead of repeating the figures of the previous
  release.

## 0.23.1 — s-INK link taps: robust touch reading, detailed log

- On the device, touch events reached the plugin but no tap was ever
  detected. Touch events are now read defensively: the position and tool
  fall back on the first pointer, the time on the reception time, an
  unknown tool is accepted (only the pen is ruled out), and an event
  without an action or position is skipped instead of breaking the
  detection.
- The diagnostics log now shows the first raw events as received, any
  unreadable event, and every finger release with its duration, distance,
  verdict (tap or not) and the event counts per action.

## 0.23.0 — s-INK links in notes (prototype)

- **Link in note**, a new title bar button on a board and on a card
  detail, places a text box on the current note page showing the name and
  its s-INK link, `s-INK/c/{shortLink}` for a card or `s-INK/b/{shortLink}`
  for a board (after Trello's own URLs). The link is also stored in the
  element's `userData`. The plugin view then closes to show the note.
- A **finger tap** on such a text box opens the plugin on that board, and
  on the card over it for a card link. Taps come from
  `PluginManager.registerMotionListener`; the page elements are read with
  `PluginFileAPI.getElements` (no permission prompt from a tap) and the
  link is looked for in `userData`, then in the text.
- **Settings > About** shows an s-INK link diagnostics log: touch events
  received, links found on the page with their bounds and source, and
  insertion results. Not yet verified on the device: that motion events
  reach the plugin while its view is closed, that touch and element
  coordinates match, and that `userData` survives saving and sync.
- Trello client: `getCardLocation` (card id and board from a short link);
  the card detail now reads `shortLink`. New strings in all locales.

## 0.22.0 — Settings categories, like the Supernote system settings

- **Settings** now has a left column of categories, separated by dotted
  lines, with the selected one marked by a black bar; its settings show on
  the right and scroll when they do not fit.
- **General** holds the public boards, the board view and the Trello
  account; **About** shows the plugin name, its version (read from
  `PluginConfig.json`), a short description and the non-affiliation
  notice. New strings in all locales.
- `ScreenFrame` gains a `flush` option for screens drawn to its edges.

## 0.21.2 — Short name spelled s-INK in every text

- The short name is now spelled **s-INK** in the texts too (all
  locales): connection steps, token storage choices, permission requests
  and error messages, as well as the relay page, the READMEs,
  CONTRIBUTING, LICENSE and code comments.
- Unchanged identifiers: the `pluginKey` `sINK`, the React Native
  component and package names, the `[sINK]` log prefix and the relay
  protocol labels (`sINK-enc`, `sINK-mac`, `sINK-v1`), which must stay
  identical on both sides of the encryption.

## 0.21.1 — Display name spelled s-INK for Trello

- The display name is now spelled **s-INK for Trello®** everywhere it is
  shown: plugin list, toolbar button, title bars, disclaimer (all
  locales), the Android app name, the README, the Trello authorization
  page and the relay page.
- Technical identifiers are unchanged: the package file stays
  `sINKforTrello.snplg`, the Android namespace `com.sinkfortrello`, the
  `pluginKey` `sINK` and the `pluginID`.

## 0.21.0 — Public boards and a favorite in the New card board picker

- The board picker of **New Trello Card** now also offers the public
  boards added in Settings on which the connected member can add cards
  (an active `normal` or `admin` member of the board). They come after
  the member's own boards, tagged "Public board"; a public board the
  member already belongs to appears once. A public board that cannot be
  read is skipped instead of failing the picker.
- Boards where the member is only an observer are no longer offered:
  Trello would refuse the new card.
- sINK now counts the cards created per board. The board used most is
  shown first, framed and tagged "Favorite · most used"; the board used
  last follows it, tagged "Last used" (ties go to the board used last).
  Counting starts with this version.
- The default selection is now the starred boards, the favorite, the
  last used board and the writable public boards; the button to go back
  to it reads "Show suggested boards only".
- Board requests now ask Trello for the board memberships.
- Bumped the plugin to version 0.21.0 (`versionCode` 54).

## 0.20.2 — Connection page fits the Manta screen

- Step 2 "Allow sINK on Trello": the QR code now sits at the right of the
  whole card, beside the title, so the text starts right under the title
  and the empty space below the QR code is gone. It is a little smaller
  (220 instead of 260).
- **Show the address** moves to step 3, next to **Open Trello's page
  directly**, and shows Trello's authorization address: both serve the
  manual flow described there.
- The separate "As soon as you copy the token…" sentence is folded into
  the step 3 text, and the token check ("Token recognized…") sits on the
  row of the Paste and Connect buttons.
- Tighter spacing (card padding, gaps, error box) and a smaller intro line,
  so the page fits the Manta screen without scrolling.
- Bumped the plugin to version 0.20.2 (`versionCode` 53).

## 0.20.1 — Clipboard watch ignores the token already copied

- Opening the connection page could fail at once with "Trello rejected
  the token": the clipboard watch tried the token already in the
  clipboard, typically an old one revoked by Disconnect. It now takes
  what is in the clipboard when the page opens as a baseline and only
  reacts to a token copied afterwards. **Paste token** still uses the
  clipboard as it is, on request.
- Bumped the plugin to version 0.20.1 (`versionCode` 52).

## 0.20.0 — Account section in Settings when signed out

- Signed out, Settings now shows the Trello account section too: "No
  Trello account connected", what connecting brings, and a **Connect your
  Trello account** button that opens the connection page (and comes back
  to Settings).
- A switch "Show “Connect your Trello account” on the boards page" hides
  the My boards section and its connect card, for someone who only reads
  public boards. It is on by default, saved with the boards page
  preferences, and has no effect once connected.
- Bumped the plugin to version 0.20.0 (`versionCode` 51).

## 0.19.3 — Masked token field

- The token field of the connection page is masked like a password, with
  a **Show** / **Hide** button next to it. Masked, it is a single line
  (Android cannot mask a multiline field); shown, it spans several lines
  as before. The live "Token recognized (N characters)" check still tells
  whether the token is complete without revealing it.
- Bumped the plugin to version 0.19.3 (`versionCode` 50).

## 0.19.2 — Stay-connected choice first on the connection page

- The choice of keeping the token is now step 1 of the connection page,
  before authorizing: with the relay, sINK connects as soon as Trello
  answers, so it has to be made first. It is a two-option selector, "Stay
  connected: Until restart | After restarts", instead of a checkbox at the
  bottom of the paste step.
- Each option explains what happens: in memory only (recommended, still
  connected after closing and reopening sINK, connect again after a
  restart), or written unencrypted in the plugin folder (who could read
  it, how to change the choice in Settings, and that Disconnect deletes
  and revokes it). Authorizing and pasting become steps 2 and 3.
- Bumped the plugin to version 0.19.2 (`versionCode` 49).

## 0.19.1 — Roadmap tile drawn as designed

- The SUPERNOTE wordmark of the roadmap tile no longer shows huge and cut
  on the tablet: its width was a percentage, which the device ignores on
  an image. It is now sized in pixels from the measured tile width, as
  wide as possible between the two round logos while keeping one "S" of
  clear space around it, and centered vertically in the band.
- The tile is named "Supernote Roadmap" again and shows the board's last
  change below, like the other tiles. Signed in, the roadmap is read with
  the other public boards to get that date.
- The unused `boards.roadmapTile` string is removed from the catalogs.

## 0.19.0 — Card detail page

- Tapping a card on the board page (all cards, Focus or Review mode)
  opens its detail: name, list, labels, members with their avatars, start
  and due dates, description, checklists with their items, attachments
  and the 20 latest comments, newest first.
- What the board already knows (name, labels, members, due date) shows at
  once; the rest comes from a single Trello request
  (`GET /1/cards/{id}` with nested checklists, attachments, members,
  comments and list). **Refresh** reloads it.
- Like the board, the page is turned, not scrolled: content is cut into
  blocks (the description paragraph by paragraph), measured and spread
  over pages, turned with ◀ ▶ or a two-finger swipe. A section heading is
  never left alone at the bottom of a page.
- Descriptions and comments are shown as plain text: Trello's Markdown
  marks (emphasis, headings, links, escapes) are removed and list bullets
  become "•". Tapping an attachment opens it in the browser.
- The detail is drawn over the board, which stays loaded: going back finds
  the same lists and card pages.
- The label chip and the small page button are now shared components.
- Bumped the plugin to version 0.19.0 (`versionCode` 47).

## 0.18.1 — No QR code without a relay

- When no relay is configured (`TRELLO_RELAY_URL` empty), the connection
  page no longer shows a QR code: it would open Trello on a phone, whose
  token would then have to be typed on the tablet. **Open in browser** and
  the clipboard watch remain.
- Bumped the plugin to version 0.18.1 (`versionCode` 46).

## 0.18.0 — Copy-free sign-in through the relay

- The QR code and **Open in browser** now open the sINK relay's page for a
  fresh session. Once the user has pressed Allow on Trello (on a phone or
  on the tablet), the token comes back by itself, end-to-end encrypted:
  the plugin polls the relay every 2 seconds and connects. Step 1 says
  "Waiting for Trello's authorization…".
- Sessions are single-use and last 10 minutes; a new one (with a new QR
  code) replaces them automatically.
- Step 2 becomes "Or paste the token": **Show the address** also offers to
  open Trello's page directly, for the manual flow and the clipboard watch.
- New `src/relay/` (SHA-256, HMAC-SHA256, base64url, session and
  decryption, all in plain JavaScript) and `src/platform/random.ts`
  (`crypto.getRandomValues` when available, otherwise a hashed entropy
  pool). The relay address is `TRELLO_RELAY_URL` in
  `src/trello/config.ts`; it is deployed at
  `https://sink-relay.sink-relay.workers.dev`.
- Bumped the plugin to version 0.18.0 (`versionCode` 45).

## Relay 1.0.0 — Cloudflare Worker for copy-free sign-in

- New `relay/` folder: a Cloudflare Worker that hands the Trello token
  from the browser where the user signed in (a phone scanning the QR code,
  or the tablet's browser) to the plugin, so it no longer has to be
  copied. The plugin does not use it yet; the plugin package is unchanged.
- End-to-end encrypted: the key travels only in the URL fragment, which
  browsers never send; the relay stores the ciphertext once, hands it over
  once and forgets it after 10 minutes (one Durable Object per session).
- The connection page it serves (in English, French, Japanese and Chinese)
  sends the browser to Trello, encrypts the returned token with WebCrypto
  and deposits it, or shows it for manual entry if anything fails.
- `relay/README.md` explains the flow, the protocol, the security model,
  the cost and how to deploy your own. Its tests run from the root with
  `npx jest relay`; the root type check now leaves `relay/` to its own
  `tsconfig.json`.

## 0.17.0 — Connect as soon as the token is copied

- While the connection page is open, the plugin reads the clipboard every
  1.5 seconds and connects by itself as soon as it holds a Trello token:
  copy the token in the browser, come back, and there is nothing else to
  press. A note in step 2 says so.
- Each clipboard text is tried at most once, so a token Trello rejected is
  not sent again until something else is copied, and nothing is read while
  a connection is in progress. **Paste token** still works as before.
- Bumped the plugin to version 0.17.0 (`versionCode` 44).

## 0.16.0 — Clearer Trello connection page

- The connection page is laid out as two framed, numbered steps:
  "Allow sINK on Trello" and "Paste the token", with shorter texts.
- Step 1 shows a QR code of the Trello authorization page, to open it on
  a phone. It is drawn with plain views by a small built-in encoder
  (byte mode, level M, versions 1–10), so no dependency is added.
- The long authorization address is hidden behind "Show the address".
- The token field spans several lines and says, as you type, whether the
  text is a complete token ("Token recognized (76 characters)") or not
  yet. **Connect** is only enabled for a complete token.
- Tokens shorter than 64 characters are now rejected (Trello tokens have
  64 or 76), so a half-typed token never counts as one.
- Bumped the plugin to version 0.16.0 (`versionCode` 43).

## 0.15.0 — Mode selector on the board page

- The Focus and Review buttons of the board page header are replaced by
  a mode selector "All cards | Focus | Review", drawn like the choices of
  the Settings page. The Tags button still appears, before it, in Focus
  mode.
- The refresh arrow is redrawn with a 135° gap, so its head stays well
  apart from its tail instead of seeming to bite it.
- The close sign of every page is now drawn like the refresh arrow (same
  size and line width) instead of the ✕ character, so the two line up
  exactly in the title bar.
- Bumped the plugin to version 0.15.0 (`versionCode` 42).

## 0.14.3 — Lighter board page header

- The column count button ("2 ▥") is gone from the board page header:
  the number of lists side by side is set in Settings.
- The refresh icon has no outline any more, like the close sign next to
  it, and is redrawn to read better on E Ink: a slightly larger arc with
  a clear gap and an arrowhead about three times the stroke width.
- Bumped the plugin to version 0.14.3 (`versionCode` 41).

## 0.14.2 — Refresh icon on the board page

- The "Refresh" text button in the board page header is now a clockwise
  arrow icon, drawn with plain views like the settings gear. Screen
  readers still announce it as "Refresh".
- Bumped the plugin to version 0.14.2 (`versionCode` 40).

## 0.14.1 — Public boards readable when signed out

- Signed out, opening a public board (the Supernote roadmap or one added
  by link) failed: requests sent the application key without a token,
  which Trello now rejects with HTTP 401 "missing scopes". Anonymous
  requests now carry no credentials at all, which Trello accepts for
  public boards.
- Bumped the plugin to version 0.14.1 (`versionCode` 39).

## 0.14.0 — "+" card for public boards, "My boards" when signed out

- The Public section ends with a small dashed card holding a "+". It
  opens the form adding a public board from its link or id (the same as
  in Settings) in place of the grid. The section is now always shown, so
  a board can be added even when the roadmap is hidden.
- Signed out, the card inviting to connect a Trello account is the size
  of a board tile, in a "My boards" section, instead of a large card
  across the page. It shows the Trello mark and the title; the longer
  explanation is read out to screen readers.
- Bumped the plugin to version 0.14.0 (`versionCode` 38).

## 0.13.1 — Roadmap tile within Supernote's logo clear space

- The roadmap tile keeps its composition (round logo cut on the left, a
  sliver of it in the bottom right corner, SUPERNOTE wordmark) but now
  leaves the clear space Supernote's visual identity guideline asks
  around the wordmark: one "S" wide, about 21 px on a tile. The wordmark
  is a little smaller (56 % of the tile), the corner sliver no longer
  touches it, and the round logo on the left shows only its edge and dot,
  without parts of its letters.
- Bumped the plugin to version 0.13.1 (`versionCode` 37).

## 0.13.0 — Public boards and workspace logos

- New "Public" section at the top of the boards page, hidden when empty.
  It holds Supernote's roadmap, now titled "Roadmap" with no line under
  it, and the public boards added in Settings.
- Settings has a "Public boards" section: the Supernote Roadmap can be
  hidden (not removed), and "+ Add a public board" takes a board link
  (`https://trello.com/b/{id}/…`) or its 8-character id, typed or pasted.
  The board is read from Trello first, to check it exists and is public
  and to get its name; added boards can be removed.
- Signed in, public boards are read when the page opens to show their
  background and last change; signed out, they are read when pressed.
- The roadmap tile background is made from the new Supernote logos: the
  round logo, much larger than the band and cut by it, on both sides of
  the SUPERNOTE wordmark.
- Board tiles show the logo of the Trello workspace owning the board in
  their bottom right corner, like the avatars on cards (its initial when
  it has no logo).
- Bumped the plugin to version 0.13.0 (`versionCode` 36).

## 0.12.0 — Board view settings, one account card, modern toggles

- The roadmap tile is back to the size of the other board tiles and reads
  "Supernote Roadmap" (the board's yearly official name is no longer read
  from Trello for the tile).

- New "Board view" section in Settings: the number of lists side by side
  in portrait and in landscape (1, 2 or 3), and the board mode boards open
  in (All cards, Focus, Review). These are the same settings the board
  toolbar changes, read and saved in the same place.
- The Trello account and its token storage now share one framed card: the
  avatar, the name and @username, where the token is kept, then the
  "Forget on this tablet" (or "Save on this tablet") and "Disconnect"
  buttons side by side. Each asks for a confirmation in place, as before.
- Settings use new controls: a pill-shaped on/off switch at the end of the
  row instead of a checkbox, and joined segments with the choice filled
  black for multiple-choice settings. Nothing is animated, for E Ink.
- Removed the now unused `TokenStorageNotice` component and the
  "Token storage" heading.
- Bumped the plugin to version 0.12.0 (`versionCode` 35).

## 0.11.5 — Non-affiliation notice in Settings

- The bottom of the Settings page shows the non-affiliation and trademark
  notice from the README (not affiliated with Trello, Inc., Atlassian or
  Ratta), in small text, in every supported language.
- Added a `small` (18) size to the theme typography.
- Bumped the plugin to version 0.11.5 (`versionCode` 34).

## 0.11.4 — Official roadmap name, plainer titles

- The roadmap tile spans the whole width of the page and shows the board's
  official name as read from Trello ("Supernote A5 X/A6 X/Manta/Nomad
  Software Roadmap 2026" until it is read, as Ratta renames it yearly),
  with "Public Trello board, read-only" under it.
- The title bars drop the "®" sign and the version line:
  "sINK for Trello: Boards", "sINK for Trello: Settings".
- Bumped the plugin to version 0.11.4 (`versionCode` 33).

## 0.11.3 — Account shown in Settings only

- The boards page title bar no longer shows the avatar and "Logged in as";
  only the Settings button remains next to the title.
- The Account section of Settings shows the Trello avatar next to
  "Signed in as {name} (@{username})".
- Bumped the plugin to version 0.11.3 (`versionCode` 32).

## 0.11.2 — Package renamed to sINKforTrello.snplg

- The build now writes `build/outputs/sINKforTrello.snplg` instead of
  `sINK.snplg`. Only the file name changes: the package name and the
  `pluginKey` stay `sINK`, so the tablet updates the installed plugin and
  keeps its settings and stored token.
- Bumped the plugin to version 0.11.2 (`versionCode` 31).

## 0.11.1 — No star on board tiles

- Board tiles no longer show a star badge in their corner: starred boards
  are already grouped under "★ Starred boards".
- Bumped the plugin to version 0.11.1 (`versionCode` 30).

## 0.11.0 — Boards page without an account

- Without a connected account, the boards page opens instead of the
  connection screen. It shows the Supernote roadmap tile, which can be
  opened anonymously (a public board read with the API key only), and a
  large dashed card with the Trello mark, "Connect your Trello account",
  that leads to the connection screen. That screen has a back button.
- The connection screen still opens by itself when a stored account could
  not be restored, to explain why, and for the lasso button, as card
  creation needs an account.
- Settings without an account only show the display options.
- `TrelloClient` accepts no token: requests then carry the key in the
  query string and no `Authorization` header.
- Bumped the plugin to version 0.11.0 (`versionCode` 29).

## 0.10.2 — Board background images and version number

- Board tiles show the board's background photo when it has one (the
  smallest scaled version wide enough for the tile, with the grey shade
  underneath while it loads or if it fails), and a taller background part,
  closer to Trello's tiles.
- The Supernote roadmap is now a board tile like the others, with the
  Supernote logo as its background image.
- "Your boards" is renamed "Other boards", as starred boards are listed
  above it.
- The title bar reads "sINK for Trello®" and shows the plugin version
  under the title, on the boards and settings pages.
- Bumped the plugin to version 0.10.2 (`versionCode` 28).

## 0.10.1 — Board tiles and account header

- Starred boards are no longer repeated under "Your boards", which now
  lists only the other boards.
- Section titles lose their underline, and the "Supernote" title above the
  roadmap card is gone.
- Board tiles look like Trello's: a larger colored top with the star in its
  corner, and a white footer with the name and the date of the last
  change ("Modified today", "Modified 3 days ago", "Modified on 12 Oct"),
  from the board's `dateLastActivity`.
- The title bar shows the Trello avatar and "Logged in as {name}", and the
  Settings button has a gear icon (drawn with views, as the tablet fonts
  lack the ⚙ sign).
- The member is fetched with its `avatarUrl`.
- Bumped the plugin to version 0.10.1 (`versionCode` 27).

## 0.10.0 — Boards page redesign and Settings

- The boards page is laid out like Trello's: boards are tiles in a grid
  (three columns in portrait, four in landscape) with a grey band standing
  for the board background color, and a ★ on starred ones. Sections:
  "Supernote", "Starred boards", then "Your boards".
- The Supernote section holds a card with the Supernote logo that opens
  Supernote's official Trello roadmap, replacing the roadmap banner.
- The page no longer scrolls: it is split into pages turned with the ‹ ›
  buttons or a two-finger swipe, and a section title never ends a page.
- New Settings page, opened from the boards page: show or hide the
  Supernote roadmap, the connected account, Disconnect (now asks for a
  confirmation) and the token storage choice. These no longer take space
  on the boards page.
- The title bar reads "sINK for Trello: Boards" (all locales).
- Boards are fetched with their `prefs` for the background colors.
- Bumped the plugin to version 0.10.0 (`versionCode` 26).

## 0.9.3 — "New Trello Card" label

- The lasso button and the card screen title now read "New Trello Card"
  instead of "Add a Trello card" (French "Nouvelle carte Trello", Japanese
  "新しい Trello カード", Simplified Chinese "新建 Trello 卡片"; Traditional
  Chinese "新增 Trello 卡片" already meant "new").
- Bumped the plugin to version 0.9.3 (`versionCode` 25).

## 0.9.2 — Full name on the toolbar button

- The plugins menu of the toolbar now shows "sINK for Trello" instead of
  "sINK" (all locales).
- Bumped the plugin to version 0.9.2 (`versionCode` 24).

## 0.9.1 — Plugin name and author

- The plugin list showed the name as "sINK for TrelloA(R)": the Supernote
  plugin manager does not decode the "®" sign of `PluginConfig.json`. The
  plugin is now listed as plain "sINK for Trello" (the sign stays in the
  in-app strings and the README, where it renders correctly).
- The author shown in the plugin list is now "AlexandreB".
- Bumped the plugin to version 0.9.1 (`versionCode` 23).

## Tooling — deploy at the end of each task

- New project `CLAUDE.md`: Claude Code sessions run `deployPlugin.ps1` at
  the end of every development task, as a single command so it needs no
  confirmation.

## Tooling — one-command build and deploy

- New `deployPlugin.ps1`: runs `buildPlugin.ps1`, checks the package was
  rebuilt, then copies the `.snplg` to the Supernote Partner app's MyStyle
  folder so it syncs to the tablet. `-SkipBuild` copies the last package;
  `SUPERNOTE_MYSTYLE_DIR` overrides the detected folder.

## 0.9.0 — Supernote roadmap

- New **Supernote roadmap** button on the boards list. It opens Supernote's
  official public software roadmap board on Trello, to follow the features in
  development for the tablets. The board is fetched by its short link, so it
  opens even when you are not a member of it.
- Focus and Review modes are not available on that board (their buttons are
  hidden), since they are about your own cards; it is always shown in full.
- Card creation from the lasso never offers the Supernote roadmap as a
  destination, even to members of that board.
- Boards now carry their `shortLink`; new `TrelloClient.getBoard()`.
- Bumped the plugin to version 0.9.0 (`versionCode` 22).

## 0.8.3 — Renamed to sINK for Trello®

- Renamed the project from SuperTrello to **sINK for Trello®** (*sync* +
  *ink*), following Trello's trademark guidelines, which do not allow names
  derived from "Trello" but accept the "… for Trello" pattern.
- The plugin is listed as "sINK for Trello®" and its toolbar button reads
  "sINK"; every UI string, log tag and the name on the Trello authorization
  page follow (all locales).
- Technical identifiers changed too: `pluginKey`, the registered component
  and the package are now `sINK`, so the build outputs `sINK.snplg`; the
  Android namespace is `com.sinkfortrello`. The `pluginID` is unchanged.
- Settings keys stored on the tablet keep their `supertrello.*` names so that
  saved tokens and preferences survive the rename.
- The README disclaimer now carries the non-affiliation statement Trello asks
  for.
- Bumped the plugin to version 0.8.3 (`versionCode` 21).

## 0.8.2 — Plugin icon redrawn

- Redrew the plugin icon in the clean style of the 0.6.5 kanban-board icon
  (rounded frame, two filled columns and one outlined), now with a pencil
  across the bottom-right corner, tip pointing down-left.
- Bumped the plugin to version 0.8.2 (`versionCode` 20).

## 0.8.1 — New plugin icon

- Replaced the plugin icon with a hand-drawn design: a kanban board with
  three columns and a pencil, in black on a transparent background (48×48).
- Bumped the plugin to version 0.8.1 (`versionCode` 19).

## 0.8.0 — Review mode

- New **Review** switch in the board header, next to Focus. Review mode keeps
  only the cards marked complete in Trello (`dueComplete`), whoever they are
  assigned to; lists left without any card are hidden.
- As in Focus mode, lists are stacked one under another in the columns so
  that as much as possible fits on one page, with further pages when needed.
- Focus and Review are exclusive: turning one on turns the other off. The
  mode in use is remembered on the tablet; settings saved by 0.7.0 with Focus
  on keep Focus on.
- Bumped the plugin to version 0.8.0 (`versionCode` 18).

## 0.7.0 — Focus mode

- New **Focus** switch in the board header (shown inverted when on). Focus
  mode keeps only the cards assigned to you that are not marked complete and
  that carry at least one of the Focus tags; lists left without any card are
  hidden.
- New **Tags** button, next to Focus while it is on, to pick the Focus tags
  (e.g. `TODO` and `WIP`) among the label names used on the board. Names are
  compared without case, so the choice applies to every board. With no tag
  checked, the tags are ignored.
- In Focus mode, lists are stacked one under another in the columns so that
  as much as possible fits on one page; a list that does not fit goes on in
  the next column with its header repeated (prefixed with `…`), and further
  columns go to the next pages (◀ ▶ buttons or two-finger swipe).
- The Focus switch and tags are remembered on the tablet.
- Bumped the plugin to version 0.7.0 (`versionCode` 17).

## 0.6.6 — Checkmark on completed cards

- Cards marked complete in Trello (`dueComplete`, the checkbox next to the
  card title) now show a black circle with a white ✓ before their name on the
  board view, with or without a due date. Screen readers announce it as
  "Complete" (translated in every locale).
- Bumped the plugin to version 0.6.6 (`versionCode` 16).

## 0.6.5 — New plugin icon

- Replaced the template's puzzle-piece icon with a SuperTrello icon: a board
  outline holding three kanban columns (two filled, one empty), pure black on
  transparent so it stays crisp on the e-ink screen.
- Bumped the plugin to version 0.6.5 (`versionCode` 15).

## 0.6.4 — Remove the storage diagnostics

- Saving the token now works on the device, so the "Storage diagnostics"
  button is removed from the connect and boards screens, along with the
  code behind it. The read-back check and the file fallback stay.
- Bumped the plugin to version 0.6.4 (`versionCode` 14).

## 0.6.3 — Read the Android shape of FileUtils.listFiles

- Likely cause of the token not being saved: on Android, `FileUtils.listFiles`
  resolves `{path, type}` objects although the SDK typings declare strings
  (also noted by the community plugin emilesilvis/handwritten-blog-supernote-plugin).
  Treating them as strings threw on every read, so nothing could be found.
- Listing entries are now accepted as strings or objects (`path`, `filePath`,
  `name`, `fileName`), for the store and for the copy seed lookup.
- Storage diagnostics show the shape of a listing entry (field names only).
- Unit tests for both shapes.
- Verified on device: the saved token is found again after the tablet restarts.
- Bumped the plugin to version 0.6.3 (`versionCode` 13).

## 0.6.2 — More robust token saving, with storage diagnostics

- Reported on device: saving the token on the tablet did not work.
- Every write to the plugin directory is now read back; a value that cannot
  be found again counts as a failure instead of silently being lost.
- If the host does not list the empty directories back, entries are created
  as copies of a small file of the plugin package (`FileUtils.copyFile`),
  and that mode is kept for the next writes.
- The storage asks for `FILE:READ` before listing the directory, including
  at startup when the saved token is looked for.
- New "Storage diagnostics" button on the connect and boards screens:
  backend, permission states, plugin directory, entries (values masked,
  only their length), copy seed and last error.
- Unit tests for the read-back check, the file fallback and the masking.
- Bumped the plugin to version 0.6.2 (`versionCode` 12).

## 0.6.1 — More legible labels

- Reported on device: yellow labels did not stand out from the white card.
  Label chips now have a light grey outline.
- Mid-grey chips (e.g. purple, dark green) were hard to read with either
  text color: chips are now pushed to a dark shade with white text or a
  light shade with black text.
- Bumped the plugin to version 0.6.1 (`versionCode` 11).

## 0.6.0 — Board view rendering, labels and members

- List headers are now a dark grey band with white text; the outline around
  each list is gone.
- Cards show their labels as grey chips (each Trello color keeps its relative
  lightness; unnamed labels are short bars) and their members as round
  avatars (photo, or initials when there is none), up to 3 then "+N".
- Cards now take the height they need (labels, title up to 3 lines, badges
  and members). They are measured in an invisible layer first and pages hold
  only the cards that fit entirely, so none is cut or drawn under the page
  buttons.
- The refresh button shows a text label: the ⟳ glyph is missing from the
  tablet's font.
- Trello client: card labels and members, board members
  (`GET /1/boards/{id}/members`). Grey tokens added to the theme.
- Bumped the plugin to version 0.6.0 (`versionCode` 10).

## 0.5.0 — Board view

- Pressing a board in "Your boards" opens it: its open lists are shown side
  by side with their cards (title on up to 2 lines, due date, checklist
  progress, description marker).
- 2 lists side by side in portrait and 3 in landscape by default. A header
  button switches between 1, 2 and 3 lists; the choice is remembered per
  orientation.
- Lists and cards are browsed page by page instead of scrolling (slow on
  E Ink): ◀ ▶ under the lists, ▲ ▼ under each list. Cards have a fixed
  height and a page only holds the cards that fit entirely, so they are
  never drawn under the page buttons.
- Two-finger swipe, like turning pages in a document: left/right for the
  next/previous lists, up/down on a list for its next/previous cards.
- Refresh button in the header. `ScreenFrame` accepts extra header actions.
- Trello client: open cards of a board (`GET /1/boards/{id}/cards`).
- Unit tests for paging, swipe detection, preferences and the new client call.
- Bumped the plugin to version 0.5.0 (`versionCode` 9).

## 0.4.0 — Opt-in saving of the Trello token on the tablet

- The token is now always kept in memory first: it survives closing the
  plugin view, and must be pasted again after the tablet restarts.
- Saving it on the tablet is the user's explicit choice: a "Save the token on
  this tablet" checkbox (unticked by default) on the connect screen, with a
  warning that the token is then stored unencrypted and readable by anyone or
  any plugin with access to the tablet's files.
- The boards screen tells where the token is kept, with "Save on this
  tablet" (after a confirmation showing the same warning) and "Forget on this
  tablet" (stays connected for the session). Disconnecting deletes it
  everywhere and revokes it on Trello.
- New persistent backend for hosts without AsyncStorage: since plugins
  cannot write files, values are encoded into the names of empty directories
  under `<plugin directory>/state/` (`FileUtils.makeDir` / `listFiles` /
  `deleteDir`), split into chunks when long. The last board and list of the
  card flow are stored there too.
- Declared `plugin.permission.FILE:WRITE` and `FILE:DELETE`; they are only
  requested when something is actually written to the tablet.
- Unit tests for the directory store and the opt-in session logic.
- Bumped the plugin to version 0.4.0 (`versionCode` 8).

## 0.3.3 — Note read permission for the lasso

- Reported on device: "file permission has not been requested, so related
  APIs cannot be called". `getLassoElements` is a file read API and needs
  `plugin.permission.FILE:READ`.
- Declared `plugin.permission.FILE:READ` in `PluginConfig.json`.
- The permission is requested when the plugin view opens (after the session
  check) and, if still missing, right before reading the lasso selection.
- New message when note access is refused; generic `ensurePermission`
  helper replacing the Internet-only one.
- Bumped the plugin to version 0.3.3 (`versionCode` 7).

## 0.3.2 — Read the lasso selection before opening the view

- Reported on device: error 904 "No lasso action has been performed". The
  host drops the lasso once the plugin view is shown, so reading the
  selection from the card screen always came too late.
- The lasso button now only emits its event (`showType` 0): the selection is
  read immediately in the button listener, then the view is opened with
  `PluginManager.showPluginView()` and the card flow uses that result.
- Removed the "Retry" button of the no-text screen (the lasso is gone by
  then) and added a hint to close, select again and press the button.
- Unit tests for reading the selection at press time.
- Bumped the plugin to version 0.3.2 (`versionCode` 6).

## 0.3.1 — More robust lasso text reading

- Reported on device: the lasso text was not recognized.
- Lasso reading now tries several strategies: recognition of strokes with the
  page size, then with the Manta fallback size, then of every selected
  element; text boxes fall back to `PluginNoteAPI.getLassoText()`; the
  recognition result is accepted as a string or an object with `text`.
- When no text is found, the screen shows a diagnostics block (SDK responses,
  element types, page size) plus "Retry" and "Write the card manually",
  which continues the card flow with empty fields.
- Unit test for the recognition result parsing.

## 0.3.0 — Create Trello cards from a lasso selection

- Added an "Add a Trello card" lasso toolbar button in NOTE, shown when the
  selection contains handwriting or text.
- The selection is read with the SDK: handwriting goes through the device's
  recognition engine (`recognizeElements`), text boxes are read as is.
- Card flow: board picker (favorites, last used board on top, "Show all
  boards" toggle), list picker (last used list of the board on top), review
  screen with editable title and description, then creation and confirmation.
- The last board and the last list of each board are remembered.
- The plugin view now opens on the feature of the pressed button.
- Trello client: board lists and card creation (JSON body).
- Shared `ChoiceList` component and a back button in `ScreenFrame`.
- Unit tests for ordering, title/description split, preferences, launch
  routing and the new client calls.
- Bumped the plugin to version 0.3.0 (`versionCode` 4).

## 0.2.1 — Paste the Trello token

- Added a "Paste token" button on the connection screen: the long-press
  paste menu of text fields does not work in the Supernote plugin view.
  It reads the clipboard through React Native's core Android clipboard
  module and connects at once when the content looks like a token.
- Explains when the clipboard is empty or cannot be read on the device.

## Unreleased — Trello API key

- Configured the SuperTrello Trello API key in `src/trello/config.ts`
  (public by design; user tokens remain the only secret).

## 0.2.0 — Trello account connection

- Added a dependency-free Trello REST client (`src/trello/`) built from the
  official documentation: current member, open boards, token revocation.
  Credentials are sent in the `Authorization` header, never in URLs.
- On opening, the plugin looks for a linked Trello account and validates it;
  a token rejected by Trello is forgotten, transient failures can be retried.
- Added the connection screen (manual token flow of `trello.com/1/authorize`)
  and the boards screen (starred first, disconnect button).
- Declared and requested the `plugin.permission.INTERNET` permission.
- Added a key/value store that uses the host's AsyncStorage module when it
  exists and falls back to memory, with a warning, otherwise.
- Added shared `ScreenFrame` and `Button` components; removed the greeting
  screen.
- Added unit tests for the Trello client and the session logic.
- Bumped the plugin to version 0.2.0 (`versionCode` 2).

## Unreleased — Remove tablet deployment script

- Removed `scripts/deploy.mjs` and its npm scripts / config: packages are now
  delivered through the official Supernote Partner sync (`MyStyle` folder).
- Documented the Supernote Partner sync in the README install steps.
- Kept the UTF-8 BOM removal from `PluginConfig.json`.

## Unreleased — Tablet deployment script (reverted)

- Added `scripts/deploy.mjs` to push the package to the tablet over Wi-Fi
  (Browse & Access) or adb. Reverted by the next commit.

## 0.1.0 — Project bootstrap

- Scaffolded the plugin from the official `@supernote-plugin/sn-plugin-template`
  (React Native 0.79.2, `sn-plugin-lib`).
- Added a SuperTrello toolbar button in NOTE and DOC that opens the plugin view.
- Added the home screen displaying "Hi SuperTrello" with a close button.
- Added a dependency-free localization layer following the tablet's system
  language (English, French, Japanese, Simplified and Traditional Chinese),
  with live updates of the UI and the toolbar button label.
- Added `PluginConfig.json` manifest with a stable plugin ID and icon.
- Added unit tests for locale resolution and catalog consistency.
- Added README, contributing guide, MIT license and editor/git settings.
- Removed the unused iOS project from the template.
