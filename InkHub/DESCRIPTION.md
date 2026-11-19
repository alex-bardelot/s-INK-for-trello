# s-INK for Trello®

**Your Trello boards on your Supernote: read them, plan with the pen, and turn
handwriting into Trello cards.**

<!--
Listing fields for the InkHub upload form:

- Title: s-INK for Trello®
- Short description (one line): Your Trello boards on your Supernote: read
  them, plan with the pen, and turn handwriting into Trello cards.
- Category: Plugins (InkHub lists plugins as "coming"; pick the closest
  category offered at upload time).
- Thumbnail: screenshots/01-boards.png (the plugin icon is only 48×48).
- Attachment: build/outputs/sINKforTrello.snplg (version in PluginConfig.json).

Everything below this comment is the description text.
-->

s-INK (*sync* + *ink*) brings Trello to the Supernote Manta. Browse your
boards and cards on the E Ink screen, write a task by hand and send it to
Trello, start working on a card in one tap, and link your notes to the cards
they belong to.

## What you can do

- **Browse your boards.** Starred boards come first, then your other boards,
  Supernote's public roadmap and any public board you add. Boards show as
  pages of lists side by side (1 to 3 in portrait, up to 4 in landscape),
  turned with the arrows or a two-finger swipe, with no scrolling.
- **Focus on your work.** *Focus* mode keeps only the cards assigned to you
  that are not complete and carry your tags (e.g. `TODO`, `WIP`). *Review*
  mode keeps the completed cards.
- **Handwriting to card.** Circle handwriting with the lasso and press
  **New Trello Card**: the first line becomes the title, the rest the
  description, and every line starting with a square (☐, or ☑ when ticked)
  a checklist item. Pick the board, list, labels and members, check the text,
  and create the card.
- **Work on a card.** The card page shows its labels, members, description,
  checklists, attachments and comments. Tick checklist items, add or remove
  labels and members, mark the card complete and write comments, straight
  from the tablet.
- **Start work.** One button assigns you, swaps labels (e.g. removes `TODO`,
  adds `WIP`), moves the card to your "Doing" list and creates a note for the
  card, on a blank page, a Supernote template or one of your own. Every step
  is listed for you to confirm before it runs, and each can be turned off.
- **Link notes and cards.** **Insert Trello Link** ties handwriting to a card
  or board: the words get an s-INK mark, and a tap on them opens the card.
  Cards created from the lasso can be linked to their handwriting too.
- **Works offline.** Without Wi-Fi, s-INK for Trello says so and keeps your account
  linked; it reconnects by itself when the network is back.
- **Five languages.** English, French, Japanese, Simplified Chinese and
  Traditional Chinese, following the tablet's language or chosen in
  Settings.

## Requirements

- Supernote Manta (A5 X2) with Chauvet 3.31.45 or later. Other Supernote
  devices that support plugins may work but are not tested.
- Wi-Fi and a Trello account (free or paid). Public boards can be read
  without an account.

## Installation

1. Copy `sINKforTrello.snplg` into the **MyStyle** folder of the tablet
   (with the Supernote Partner app, or over USB).
2. On the tablet, open **Settings › Apps › Plugins › Add Plugin** and pick
   `sINKforTrello.snplg`.
3. Open a note or a document: the s-INK button appears in the toolbar.
4. Press it, then **Connect your Trello account**: scan the QR code with your
   phone (or open the browser on the tablet), sign in to Trello and press
   **Allow**. The plugin connects by itself.

## Privacy

- s-INK for Trello talks to Trello directly. There is no s-INK account and no
  analytics.
- Your Trello token stays on the tablet and is only sent to `api.trello.com`.
  By default it is kept in memory only; saving it across restarts is an
  opt-in setting, with a warning that it is then stored unencrypted.
- To connect without copying a token by hand, the token travels from the
  browser to the tablet through the s-INK relay, end-to-end encrypted with a
  key only the tablet knows, and is handed over once.
- **Disconnect**, in Settings, forgets the token and revokes it on Trello.

## Feedback and support

Report bugs, suggest ideas and rate s-INK for Trello here on InkHub. If s-INK for Trello is useful
to you, **Settings › Support s-INK** has a donation page: donations fund a
Supernote Nomad, to make s-INK for Trello work on smaller screens too.

## Disclaimer

s-INK for Trello® is an independent community project. It is not affiliated,
associated, authorized, endorsed by, or in any way officially connected with
Trello, Inc., Atlassian or Ratta (Supernote). Trello® is a registered
trademark of Atlassian; Supernote is a trademark of Ratta. Both are used here
only to describe what the plugin works with.
