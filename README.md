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
- **Deck Editor** — Master Duel-style layout: a full card inspector, the deck
  as an image grid, and a searchable pool. Uses open Master Duel data
  (MD-legal card set, `md_rarity`, TCG/OCG banlist) via YGOPRODeck, with an
  **MD only** toggle. Real art, .ydk import/export, saved decks.
- **Duel** — hot-seat board arranged like a Master Duel field (zones in the
  centre, each hand facing its player). The engine enforces the rules:
  turn/phase flow with auto-draw, the once-per-turn Normal Summon, tribute
  costs (1 for Lv5–6, 2 for Lv7+), automatic battle damage, and win by LP-0
  or deck-out. Click-to-attack, hover-to-preview, full log, multi-level undo.
- **Test Hand** — 3D pop-out cards; draw and mulligan.
- **Probability** — Monte-Carlo opening simulator (open-rate, brick-rate,
  distribution).

## Scope note
The engine automates the **game rules** (phases, summons, tributes, battle,
win conditions) — but you still apply individual card **effects** yourself.
Full effect automation (every card resolving itself, as in Master Duel proper)
requires the ocgcore / ygopro-core engine plus its community card scripts, a
separate project. This is the practical middle tier between Dueling Book
(fully manual) and Master Duel (fully automated).

## Data / attribution
Card data & images: YGOPRODeck API — https://ygoprodeck.com/api-guide/
For production use, cache the database and images locally per their guidance
(they ask you not to hotlink). Yu-Gi-Oh! is © Konami; this is a personal,
non-commercial practice tool.
