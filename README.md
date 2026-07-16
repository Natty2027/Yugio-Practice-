# YGO Practice Lab

A standalone Yu-Gi-Oh practice tool: deck editor, pop-out test hands,
opening-hand probability simulator, and a manual hot-seat duel board.
Card data and artwork come live from the YGOPRODeck API (v7).

## Two ways to run it

### 1. No build — just open it
Open `ygo_practice_lab.html` in a browser. Card art loads from the
YGOPRODeck CDN. If card *search* is blocked when opened as a `file://`
page, serve the folder instead:

    python3 -m http.server
    # then visit http://localhost:8000/ygo_practice_lab.html

### 2. Dev / deploy (Vite)
    npm install
    npm run dev        # local dev server
    npm run build      # outputs to dist/ (deploy to GitHub Pages, etc.)

## What's inside
- **Deck Editor** — live card search + filters, real art, .ydk import/export,
  saved decks. New releases appear as soon as they're in the database.
- **Duel** — manual hot-seat board: both players, all zones (monster / S&T /
  field / 2 shared Extra Monster Zones / GY / banish / deck / Extra), card
  state (ATK/DEF/face-down/set), phases, life points, coin/dice, game log,
  multi-level undo. You apply effects; the board tracks structure.
- **Test Hand** — 3D pop-out cards; draw and mulligan.
- **Probability** — Monte-Carlo opening simulator (open-rate, brick-rate,
  distribution).

## Scope note
The duel board does **not** auto-resolve card effects or enforce legality —
that's the manual tier (like Dueling Book). Automated rules enforcement is a
separate project built on the ocgcore (ygopro-core) engine + community card
scripts.

## Data / attribution
Card data & images: YGOPRODeck API — https://ygoprodeck.com/api-guide/
For production use, cache the database and images locally per their guidance
(they ask you not to hotlink). Yu-Gi-Oh! is © Konami; this is a personal,
non-commercial practice tool.
