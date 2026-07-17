# YGO Practice Lab

A standalone Yu-Gi-Oh practice tool: deck editor, opening-hand probability
simulator, a fully rules-enforced **automatic duel** (real card effects resolve
themselves), and a manual hot-seat board. Card data and artwork come live from
the YGOPRODeck API (v7).

## Two ways to run it

### 1. Dev / deploy (Vite) — recommended
    npm install
    npm run dev        # local dev server
    npm run build      # outputs to dist/ (deploy to GitHub Pages, etc.)

### 2. No build
Open `ygo_practice_lab.html` in a browser (or serve the folder with
`python3 -m http.server` if card search is blocked on `file://`).

## Tabs

- **Deck Editor** — Master Duel-style layout: card inspector, the deck as an
  image grid, and a searchable pool. MD-legal set, `md_rarity`, TCG/OCG banlist
  via YGOPRODeck, with an **MD only** toggle. Real art, .ydk import/export,
  saved decks.
- **Duel** — the automatic engine. Loads your deck on both sides, plays under
  the real Master Rules with the EDOPro (ocgcore) engine + the community card
  scripts, so **card effects resolve automatically**. You answer the engine's
  prompts; a basic AI plays the other seat. The field is styled after Master
  Duel's forest-ruins arena.
- **Manual Board** — hot-seat manual play. The engine enforces the game *rules*
  (phase flow, once-per-turn Normal Summon, tribute costs, battle damage, win by
  LP-0 / deck-out) but you apply card effects yourself. Includes a heuristic AI
  opponent and a move coach.
- **Test Hand** — 3D pop-out cards; draw and mulligan.
- **Probability** — Monte-Carlo opening simulator (open-rate, brick-rate,
  distribution).

## What was fixed in this pass

1. **Opponent board mirrored the player.** The engine field query was passing
   `team` where the ocgcore-wasm API expects `controller`; both sides read
   player 0, so P2's monsters/spells appeared as copies of yours. Now each side
   is queried by controller.
2. **Cards didn't sit in their real zones.** The board read filtered out empty
   slots, collapsing everything left. Zones are now preserved 0–4, the two
   shared **Extra Monster Zones** and the **Field Spell** zone are read
   separately, and `LEVEL` is pulled so the ★level shows on each monster.
3. **Engine self-test loaded no card scripts.** In `EngineBeta` (Phase 2) the
   sync core was handed an **async** `scriptReader`, which returns a Promise
   where the WASM expects a Lua string — so every effect script silently failed.
   It now uses the shared synchronous reader, same as the playable Duel tab.
4. **Every duel dealt identical hands.** The RNG seed was hard-coded
   `[1,2,3,4]`. Each duel now seeds randomly.
5. **Occasional engine deadlock.** `drive()` only looked for the selection
   request in the current message batch; when `WAITING` arrived a batch later
   the loop returned and the game froze. The last selection is now remembered
   across batches (and cleared after every response).
6. **Master Duel visual overhaul.** The Duel arena was reskinned to match MD:
   stone octagon zone pads, forest-ruins border, red enemy-edge / blue
   player-edge glows, corner LP plates, the red turn hex, the blue circular
   info/log rail buttons, the dark instruction band, a **TURN CHANGE** banner,
   and MD-style ★level + ATK/DEF readouts. Procedural SFX fire on
   summon/attack/damage.

## Porting to iOS / Xcode — read this first (licensing)

You asked about building this in Xcode and pulling from the best open-source YGO
simulator. Two things you need to know before shipping or selling:

- **The automatic-effect engine is copyleft.** EDOPro / ygopro-core (ocgcore)
  and its card scripts are licensed **AGPLv3 / GPLv3**. If you bundle or link
  that engine into an app you distribute, the AGPL requires you to release your
  entire app's source under the AGPL too. That's incompatible with a closed
  App Store title or an asset sale on Codester/Flippa. The `ocgcore-wasm`
  wrapper itself is MIT, but it *loads* the AGPL engine and GPL scripts at
  runtime — the copyleft attaches to the engine, not the wrapper.
- **What you can safely ship:** the parts that are yours — the deck editor,
  probability simulator, and the **Manual Board** (which implements the game
  *rules* from scratch, no ocgcore). For a native iOS build, port those to
  SwiftUI; the rules state-machine in `DuelBoard` (phases, summon legality,
  tribute counts, battle math, win conditions) maps cleanly to Swift. Keep full
  automatic-effect resolution as an *optional* AGPL build, or a
  server/WebView-based mode that you keep open-source, so the copyleft never
  touches your proprietary code.

## Data / attribution
Card data & images: YGOPRODeck API — https://ygoprodeck.com/api-guide/
Engine + scripts: Project Ignis / EDOPro (AGPLv3), loaded at runtime from CDN.
For production, cache the card database and images locally per YGOPRODeck's
guidance (they ask you not to hotlink). Yu-Gi-Oh! is © Konami; this is a
personal, non-commercial practice tool.
