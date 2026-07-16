import { useState, useEffect, useMemo, useRef, useCallback } from "react";

/*  YGO PRACTICE LAB — standalone goldfishing / deck-testing tool
    Data + art: YGOPRODeck API v7 (https://ygoprodeck.com/api-guide/)
    No AI calls. Card art is loaded from the YGOPRODeck CDN at runtime; for a
    local/production build, download the image set locally per their API guide
    (they ask you to cache data and not hotlink).                             */

const API = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const IMG = (id, small) =>
  `https://images.ygoprodeck.com/images/cards${small ? "_small" : ""}/${id}.jpg`;
const IMG_CROP = (id) =>
  `https://images.ygoprodeck.com/images/cards_cropped/${id}.jpg`;

const REDUCED = typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* darken / lighten a hex colour */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, v));
  const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
/* hex → rgba string with alpha */
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
/* Master Duel-ish zone tones */
const ZONE = { mon: "#d8a13a", st: "#2fa6a0", emz: "#8a6bff", field: "#3fa96a", extra: "#8a6bff", pile: "#5a6a86" };

/* ---- design tokens ---------------------------------------------------- */
const C = {
  bg: "#0d1016",
  panel: "#161b24",
  panel2: "#1d2430",
  line: "#2b3342",
  gold: "#e8b84b",
  goldDim: "#9c7f30",
  text: "#ece6d6",
  mute: "#828b9e",
  good: "#4fbf7b",
  bad: "#e0576a",
};
/* real YGO card-frame colours — the UI's semantic language */
const FRAME = {
  normal:  { bg: "#b8935a", fg: "#1a1206" },
  effect:  { bg: "#a85a30", fg: "#fbeee2" },
  ritual:  { bg: "#3f66a8", fg: "#eef3fb" },
  fusion:  { bg: "#7a4f96", fg: "#f4ecfa" },
  synchro: { bg: "#dad4c6", fg: "#1a1a1a" },
  xyz:     { bg: "#20242b", fg: "#e6e6e6" },
  link:    { bg: "#2a5f86", fg: "#e8f2fb" },
  spell:   { bg: "#1a8f6c", fg: "#effaf5" },
  trap:    { bg: "#a83f74", fg: "#fbeaf3" },
  token:   { bg: "#5a6070", fg: "#eee" },
  skill:   { bg: "#3d5a80", fg: "#eee" },
};
const frameKey = (ft = "") => {
  ft = ft.toLowerCase();
  if (ft.includes("link")) return "link";
  if (ft.includes("xyz")) return "xyz";
  if (ft.includes("synchro")) return "synchro";
  if (ft.includes("fusion")) return "fusion";
  if (ft.includes("ritual")) return "ritual";
  if (ft.includes("spell")) return "spell";
  if (ft.includes("trap")) return "trap";
  if (ft.includes("normal")) return "normal";
  if (ft.includes("token")) return "token";
  if (ft.includes("skill")) return "skill";
  return "effect";
};
const isExtra = (ft = "") =>
  /fusion|synchro|xyz|link/.test(ft.toLowerCase());

/* ---- sample deck (by name) so the app is useful on first load --------- */
/* stubs carry a best-effort passcode + frame so the UI populates even
   offline; on mount we hydrate real ids/art/stats via ONE batched query. */
const SAMPLE = [
  ["Blue-Eyes White Dragon", 89631139, "normal", 3],
  ["Blue-Eyes Alternative White Dragon", 38517737, "effect", 3],
  ["Sage with Eyes of Blue", 79852326, "effect", 3],
  ["Maiden with Eyes of Blue", 88241506, "effect", 2],
  ["Master with Eyes of Blue", 45644898, "effect", 1],
  ["Ash Blossom & Joyous Spring", 14558127, "effect", 3],
  ["Maxx \"C\"", 23434538, "effect", 3],
  ["Effect Veiler", 97268402, "effect", 2],
  ["Nibiru, the Primal Being", 27204311, "effect", 1],
  ["Dragon Shrine", 81275020, "spell", 2],
  ["The Melody of Awakening Dragon", 48800175, "spell", 2],
  ["Trade-In", 38120068, "spell", 3],
  ["Pot of Extravagance", 49238328, "spell", 2],
  ["Called by the Grave", 24224830, "spell", 2],
  ["Monster Reborn", 83764718, "spell", 1],
  ["Harpie's Feather Duster", 18144506, "spell", 1],
  ["Return of the Dragon Lords", 6853254, "spell", 2],
  ["Infinite Impermanence", 10045474, "trap", 3],
  ["Solemn Judgment", 41420027, "trap", 1],
  // extra
  ["Blue-Eyes Twin Burst Dragon", 20721928, "fusion", 2],
  ["Blue-Eyes Spirit Dragon", 59822133, "synchro", 2],
  ["Azure-Eyes Silver Dragon", 30576089, "synchro", 2],
  ["Crystal Wing Synchro Dragon", 50954680, "synchro", 1],
  ["Stardust Dragon", 44508094, "synchro", 1],
  ["Number 38: Hope Harbinger Dragon Titanic Galaxy", 33776843, "xyz", 2],
  ["Galaxy-Eyes Cipher Dragon", 18963306, "xyz", 1],
  ["Hieratic Seal of the Heavenly Spheres", 24361622, "xyz", 2],
  ["I:P Masquerena", 65741786, "link", 1],
  ["Accesscode Talker", 86066372, "link", 1],
];

const CATS = [
  ["", "All"],
  ["Effect Monster,Normal Monster,Flip Effect Monster,Gemini Monster,Spirit Monster,Tuner Monster,Union Effect Monster,Pendulum Effect Monster,Normal Tuner Monster", "Monsters"],
  ["Fusion Monster,Synchro Monster,XYZ Monster,Link Monster,Synchro Tuner Monster,Pendulum Effect Fusion Monster", "Extra"],
  ["Spell Card", "Spells"],
  ["Trap Card", "Traps"],
];
const ATTRS = ["", "DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"];

/* small persistent-storage wrapper (falls back to memory) --------------- */
const mem = {};
const store = {
  async get(k) {
    try { const r = await window.storage.get(k); return r ? r.value : mem[k]; }
    catch { return mem[k]; }
  },
  async set(k, v) {
    mem[k] = v;
    try { await window.storage.set(k, v); } catch { /* memory only */ }
  },
};

/* ====================================================================== */
export default function App() {
  const [tab, setTab] = useState("editor");
  const [main, setMain] = useState([]);   // arrays of card objects (1 per copy)
  const [extra, setExtra] = useState([]);
  const [side, setSide] = useState([]);
  const [online, setOnline] = useState(null);
  const [toast, setToast] = useState("");

  /* hydrate sample deck once — fetch by passcode so every card gets real art,
     stats and effect text (IDs are exact; name matching misses on punctuation) */
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = SAMPLE.map((s) => s[1]);
      let byId = {};
      try {
        const res = await fetch(`${API}?misc=yes&id=${ids.join(",")}`);
        const j = await res.json();
        if (j.data) j.data.forEach((c) => (byId[c.id] = c));
        if (alive) setOnline(true);
      } catch { if (alive) setOnline(false); }
      const m = [], x = [];
      SAMPLE.forEach(([name, id, ft, n]) => {
        const real = byId[id];
        const card = real
          ? normalize(real)
          : { id, name, frameType: ft, type: ft, level: null, atk: null, def: null, attribute: null, race: null, desc: "(effect text unavailable offline)" };
        for (let i = 0; i < n; i++) (isExtra(card.frameType) ? x : m).push(card);
      });
      if (alive) { setMain(m); setExtra(x); }
    })();
    return () => { alive = false; };
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  const countOf = (list, name) => list.filter((c) => c.name === name).length;
  const totalCopies = (name) =>
    countOf(main, name) + countOf(extra, name) + countOf(side, name);

  const addCard = useCallback((card, dest) => {
    const target = dest || (isExtra(card.frameType) ? "extra" : "main");
    if (totalCopies(card.name) >= 3) return flash("Max 3 copies");
    const setter = target === "main" ? setMain : target === "extra" ? setExtra : setSide;
    const cap = target === "extra" ? 15 : target === "side" ? 15 : 60;
    setter((prev) => (prev.length >= cap ? (flash(`${target} deck full`), prev) : [...prev, card]));
  }, [main, extra, side]);

  const removeOne = (list, setter, name) => {
    const i = list.map((c) => c.name).lastIndexOf(name);
    if (i >= 0) { const cp = [...list]; cp.splice(i, 1); setter(cp); }
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:9px;height:9px}
        ::-webkit-scrollbar-thumb{background:${C.line};border-radius:9px}
        ::-webkit-scrollbar-track{background:transparent}
        .mono{font-family:ui-monospace,'SF Mono',Menlo,monospace}
        .disp{font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        button{cursor:pointer;font-family:inherit}
        .cardimg{transition:transform .12s ease, box-shadow .12s ease}
        .cardimg:hover{transform:translateY(-3px);box-shadow:0 6px 18px rgba(0,0,0,.55)}
        input,select{font-family:inherit}
        .dcard{animation:popIn .28s cubic-bezier(.2,.9,.3,1.25)}
        .dcard:hover{filter:brightness(1.12)}
        .lpnum{display:inline-block;animation:lpPulse .45s ease}
        .turnbanner{animation:bannerIn .5s ease}
        @keyframes popIn{from{transform:scale(.55) translateY(6px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
        @keyframes lpPulse{0%{transform:scale(1)}35%{transform:scale(1.28)}100%{transform:scale(1)}}
        @keyframes bannerIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes attackPulse{0%,100%{box-shadow:0 0 0 0 rgba(224,87,106,.7)}50%{box-shadow:0 0 0 5px rgba(224,87,106,0)}}
        .atktarget{animation:attackPulse 1.1s infinite}
        @media (prefers-reduced-motion:reduce){.cardimg,.dcard,.lpnum,.turnbanner,.atktarget{animation:none;transition:none}}
      `}</style>

      {/* header */}
      <header style={{ borderBottom: `1px solid ${C.line}`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 18, position: "sticky", top: 0, background: "rgba(13,16,22,.92)", backdropFilter: "blur(6px)", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, transform: "rotate(45deg)", background: `linear-gradient(135deg,${C.gold},${C.goldDim})`, borderRadius: 4, boxShadow: `0 0 14px ${C.goldDim}` }} />
          <div>
            <div className="disp" style={{ fontSize: 17, color: C.gold, lineHeight: 1 }}>Practice Lab</div>
            <div className="mono" style={{ fontSize: 10, color: C.mute, letterSpacing: ".18em" }}>GOLDFISH · TEST · TUNE</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {[["editor", "Deck Editor"], ["duel", "Duel"], ["hand", "Test Hand"], ["stats", "Probability"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="disp"
              style={{ fontSize: 12, padding: "8px 14px", borderRadius: 6, border: "none",
                background: tab === k ? C.gold : "transparent",
                color: tab === k ? "#1a1206" : C.mute }}>
              {l}
            </button>
          ))}
        </nav>
        <div className="mono" style={{ marginLeft: "auto", fontSize: 11, color: online === false ? C.bad : C.mute }}>
          {online === null ? "connecting…" : online ? "● live db" : "○ offline (sample only)"}
        </div>
      </header>

      {tab === "editor" && (
        <Editor main={main} extra={extra} side={side}
          setMain={setMain} setExtra={setExtra} setSide={setSide}
          addCard={addCard} removeOne={removeOne} countOf={countOf} flash={flash} />
      )}
      {tab === "duel" && <DuelBoard main={main} extra={extra} />}
      {tab === "hand" && <HandTester main={main} />}
      {tab === "stats" && <Probability main={main} />}

      {toast && (
        <div className="mono" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: C.panel2, border: `1px solid ${C.gold}`, color: C.gold, padding: "9px 16px", borderRadius: 8, fontSize: 12, zIndex: 50 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---- helpers ---------------------------------------------------------- */
function normalize(c) {
  const misc = c.misc_info?.[0];
  return {
    id: c.card_images?.[0]?.id ?? c.id,
    name: c.name,
    frameType: c.frameType || (c.type?.toLowerCase().includes("spell") ? "spell" : c.type?.toLowerCase().includes("trap") ? "trap" : "effect"),
    type: c.type,
    level: c.level ?? c.rank ?? c.linkval ?? null,
    atk: c.atk ?? null,
    def: c.def ?? null,
    attribute: c.attribute ?? null,
    race: c.race ?? null,
    desc: c.desc ?? "",
    // open-source Master Duel data (via YGOPRODeck misc_info)
    rarity: misc?.md_rarity ?? null,
    formats: misc?.formats ?? null,
    inMD: misc?.formats ? misc.formats.includes("Master Duel") : null,
    banTcg: c.banlist_info?.ban_tcg ?? null,
    banOcg: c.banlist_info?.ban_ocg ?? null,
  };
}
/* short rarity tag + colour for the Master Duel rarity gems */
const RARITY = {
  "Ultra Rare": { t: "UR", c: "#e8b84b" },
  "Super Rare": { t: "SR", c: "#c0c0d8" },
  Rare: { t: "R", c: "#6fb6ff" },
  "N-Rare": { t: "N", c: "#9aa2b1" },
  Normal: { t: "N", c: "#9aa2b1" },
};
const groupBy = (list) => {
  const m = new Map();
  list.forEach((c) => m.set(c.name, { card: c, n: (m.get(c.name)?.n || 0) + 1 }));
  return [...m.values()];
};

/* ====================================================================== */
/*  DECK EDITOR                                                            */
/* ====================================================================== */
function Editor({ main, extra, side, setMain, setExtra, setSide, addCard, removeOne, countOf, flash }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [attr, setAttr] = useState("");
  const [level, setLevel] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dest, setDest] = useState("auto");     // auto | side
  const [mdOnly, setMdOnly] = useState(true);    // restrict pool to the Master Duel card set
  const [preview, setPreview] = useState(null);
  const [savedNames, setSavedNames] = useState([]);
  const debounce = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { (async () => setSavedNames((await store.get("deck_index")) || []))(); }, []);

  const runSearch = useCallback(async () => {
    if (!q && !cat && !attr && !level) { setResults([]); return; }
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set("fname", q);
    if (cat) p.set("type", cat);
    if (attr) p.set("attribute", attr);
    if (level) p.set("level", level);
    if (mdOnly) p.set("format", "master duel");   // open Master Duel legal pool
    p.set("misc", "yes");                          // pulls md_rarity / formats
    p.set("num", "80"); p.set("offset", "0");
    try {
      const r = await fetch(`${API}?${p.toString()}`);
      const j = await r.json();
      setResults((j.data || []).map(normalize));
    } catch { setResults([]); flash("Search unavailable offline"); }
    setLoading(false);
  }, [q, cat, attr, level, mdOnly]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(runSearch, 320);
    return () => clearTimeout(debounce.current);
  }, [q, cat, attr, level, mdOnly, runSearch]);

  const total = main.length;
  const mainGroups = useMemo(() => groupBy(main), [main]);
  const extraGroups = useMemo(() => groupBy(extra), [extra]);
  const sideGroups = useMemo(() => groupBy(side), [side]);

  /* .ydk export / import */
  const exportYdk = () => {
    const body =
      "#created by YGO Practice Lab\n#main\n" +
      main.map((c) => c.id).join("\n") +
      "\n#extra\n" + extra.map((c) => c.id).join("\n") +
      "\n!side\n" + side.map((c) => c.id).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "deck.ydk"; a.click();
    URL.revokeObjectURL(url);
  };
  const importYdk = async (file) => {
    const text = await file.text();
    const sec = { main: [], extra: [], side: [] };
    let cur = "main";
    text.split(/\r?\n/).forEach((ln) => {
      ln = ln.trim();
      if (/^#main/i.test(ln)) cur = "main";
      else if (/^#extra/i.test(ln)) cur = "extra";
      else if (/^!side/i.test(ln)) cur = "side";
      else if (/^\d+$/.test(ln)) sec[cur].push(ln);
    });
    const ids = [...new Set([...sec.main, ...sec.extra, ...sec.side])];
    let byId = {};
    try {
      const r = await fetch(`${API}?misc=yes&id=${ids.join(",")}`);
      const j = await r.json();
      (j.data || []).forEach((c) => (byId[c.id] = normalize(c)));
    } catch { flash("Couldn't fetch card data (offline)"); }
    const build = (arr) => arr.map((id) => byId[id] || { id, name: `#${id}`, frameType: "effect", type: "?", level: null, desc: "" }).filter(Boolean);
    setMain(build(sec.main)); setExtra(build(sec.extra)); setSide(build(sec.side));
    flash(`Imported ${sec.main.length}+${sec.extra.length}+${sec.side.length}`);
  };

  const saveDeck = async () => {
    const name = prompt("Save deck as:");
    if (!name) return;
    await store.set(`deck:${name}`, JSON.stringify({ main, extra, side }));
    const idx = [...new Set([...(await store.get("deck_index") || []), name])];
    await store.set("deck_index", idx); setSavedNames(idx); flash("Saved");
  };
  const loadDeck = async (name) => {
    const raw = await store.get(`deck:${name}`);
    if (!raw) return;
    const d = JSON.parse(raw);
    setMain(d.main || []); setExtra(d.extra || []); setSide(d.side || []);
    flash(`Loaded ${name}`);
  };

  const hover = (c) => setPreview(c);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "272px minmax(0,1fr) minmax(300px,.92fr)", height: "calc(100vh - 60px)", background: MD.bg }}>
      {/* ---- left: full card inspector (Master Duel style) ---- */}
      <aside style={{ borderRight: `1px solid ${MD.line}`, padding: 14, overflowY: "auto", background: `linear-gradient(180deg, ${MD.panel}, ${MD.bg})` }}>
        <CardInspector card={preview} />
      </aside>

      {/* ---- centre: the deck being built ---- */}
      <section style={{ display: "flex", flexDirection: "column", minWidth: 0, borderRight: `1px solid ${MD.line}` }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${MD.line}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="disp" style={{ fontSize: 13, color: MD.gold, marginRight: 4 }}>Deck</span>
          <button onClick={saveDeck} style={mdBtn()}>Save</button>
          <select onChange={(e) => e.target.value && loadDeck(e.target.value)} value="" style={{ ...inp(), maxWidth: 120 }}>
            <option value="">Load…</option>
            {savedNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={() => fileRef.current?.click()} style={mdBtn()}>Import .ydk</button>
          <button onClick={exportYdk} style={mdBtn()}>Export</button>
          <button onClick={() => { setMain([]); setExtra([]); setSide([]); }} style={{ ...mdBtn(), borderColor: C.bad, color: C.bad }}>Clear</button>
          <input ref={fileRef} type="file" accept=".ydk,.txt" style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && importYdk(e.target.files[0])} />
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: 14 }}>
          <DeckSection title="Main Deck" count={main.length} min={40} max={60}
            groups={mainGroups} onRemove={(n) => removeOne(main, setMain, n)} onHover={hover} />
          <DeckSection title="Extra Deck" count={extra.length} min={0} max={15}
            groups={extraGroups} onRemove={(n) => removeOne(extra, setExtra, n)} onHover={hover} />
          <DeckSection title="Side Deck" count={side.length} min={0} max={15}
            groups={sideGroups} onRemove={(n) => removeOne(side, setSide, n)} onHover={hover} />
        </div>
      </section>

      {/* ---- right: searchable card pool ---- */}
      <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${MD.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search card name…" style={inp(1, "120px")} />
            <button onClick={() => setMdOnly((v) => !v)} className="disp" title="Restrict to the Master Duel card set"
              style={{ fontSize: 10, padding: "6px 10px", borderRadius: 6, border: `1px solid ${mdOnly ? MD.gold : MD.line}`, background: mdOnly ? "rgba(232,184,75,.16)" : "transparent", color: mdOnly ? MD.gold : C.mute, whiteSpace: "nowrap" }}>
              MD only
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={inp()}>
              {CATS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
            </select>
            <select value={attr} onChange={(e) => setAttr(e.target.value)} style={inp()}>
              {ATTRS.map((a) => <option key={a} value={a}>{a || "Any attr"}</option>)}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} style={inp()}>
              <option value="">Any Lv</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>Lv/Rk {l}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
              {["auto", "side"].map((d) => (
                <button key={d} onClick={() => setDest(d)} className="disp"
                  style={{ fontSize: 10, padding: "5px 9px", borderRadius: 5, border: `1px solid ${dest === d ? MD.gold : MD.line}`, background: dest === d ? "rgba(232,184,75,.14)" : "transparent", color: dest === d ? MD.gold : C.mute }}>
                  {d === "auto" ? "→ Main/Extra" : "→ Side"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: 12, flex: 1 }}>
          {loading && <p className="mono" style={{ color: C.mute, fontSize: 12 }}>searching…</p>}
          {!loading && results.length === 0 && <EmptyHint mdOnly={mdOnly} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(72px,1fr))", gap: 7 }}>
            {results.map((c) => (
              <CardTile key={c.id + c.name} card={c}
                badge={countOf(main, c.name) + countOf(extra, c.name) + countOf(side, c.name)}
                onClick={() => addCard(c, dest === "side" ? "side" : undefined)}
                onHover={() => setPreview(c)} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* Master Duel deck-editor palette (deep navy / violet) */
const MD = { bg: "#0b0e1a", panel: "#141a30", panel2: "#1c2440", line: "#2c3556", gold: "#e8c25a", accent: "#6d8dff" };
const mdBtn = () => ({ background: MD.panel2, border: `1px solid ${MD.line}`, color: C.text, borderRadius: 6, padding: "7px 11px", fontSize: 12 });

/* left-hand inspector — big art, stats, effect text, MD rarity */
function CardInspector({ card }) {
  if (!card) return (
    <div style={{ color: C.mute, fontSize: 12.5, lineHeight: 1.6, marginTop: 30, textAlign: "center" }}>
      <div style={{ fontSize: 40, opacity: .25 }}>🂠</div>
      <p className="disp" style={{ color: MD.gold, fontSize: 12, margin: "10px 0 6px" }}>Card details</p>
      Hover any card in your deck or the pool to inspect it here.
    </div>
  );
  const f = FRAME[frameKey(card.frameType)];
  const rar = card.rarity ? RARITY[card.rarity] : null;
  return (
    <div>
      <div style={{ borderRadius: 8, overflow: "hidden", border: `2px solid ${f.bg}`, boxShadow: `0 8px 26px rgba(0,0,0,.55)` }}>
        <img src={IMG(card.id)} alt={card.name} style={{ width: "100%", display: "block", background: MD.panel2 }} onError={(e) => (e.target.style.visibility = "hidden")} />
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{card.name}</span>
        {rar && <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: "#1a1206", background: rar.c, borderRadius: 4, padding: "1px 5px" }}>{rar.t}</span>}
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: f.bg, marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{card.type}</div>
      <div className="mono" style={{ fontSize: 11, color: C.mute, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {card.attribute && <span>{card.attribute}</span>}
        {card.race && <span>{card.race}</span>}
        {card.level != null && <span>{isExtra(card.frameType) && /link/i.test(card.frameType) ? "LINK" : "Lv/Rk"} {card.level}</span>}
      </div>
      {card.atk != null && (
        <div className="mono" style={{ fontSize: 13, color: MD.gold, marginTop: 6, fontWeight: 700 }}>ATK {card.atk} / DEF {card.def ?? "—"}</div>
      )}
      {(card.banTcg || card.banOcg) && (
        <div className="mono" style={{ fontSize: 10, color: C.bad, marginTop: 6 }}>
          {card.banTcg ? `TCG: ${card.banTcg}` : ""}{card.banTcg && card.banOcg ? " · " : ""}{card.banOcg ? `OCG: ${card.banOcg}` : ""}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "#c8cee0", marginTop: 10, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{card.desc}</div>
    </div>
  );
}

function EmptyHint({ mdOnly }) {
  return (
    <div style={{ color: C.mute, fontSize: 12.5, lineHeight: 1.6 }}>
      <p className="disp" style={{ color: MD.gold, fontSize: 12, marginBottom: 6 }}>Search the pool</p>
      Type a name or filter by type / attribute / level. {mdOnly ? "Showing only cards in the Master Duel set — " : "Showing the full card database — "}
      toggle <b>MD only</b> to switch. Click a card to add it; Extra-Deck monsters route automatically.
    </div>
  );
}

/* one deck zone rendered as an image grid, like Master Duel's edit screen */
function DeckSection({ title, count, min, max, groups, onRemove, onHover }) {
  const ok = count >= min && count <= max;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className="disp" style={{ fontSize: 12, color: C.text }}>{title}</span>
        <span className="mono" style={{ fontSize: 11, color: ok ? C.good : C.mute, border: `1px solid ${ok ? C.good : MD.line}`, borderRadius: 20, padding: "1px 8px" }}>
          {count}{max ? `/${max}` : ""}
        </span>
        <div style={{ flex: 1, height: 1, background: MD.line }} />
      </div>
      {groups.length === 0 && <p className="mono" style={{ fontSize: 11, color: C.mute }}>empty</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(58px,1fr))", gap: 6 }}>
        {groups.map(({ card, n }) => (
          <DeckCell key={card.name} card={card} n={n} onRemove={() => onRemove(card.name)} onHover={() => onHover(card)} />
        ))}
      </div>
    </div>
  );
}

function DeckCell({ card, n, onRemove, onHover }) {
  const f = FRAME[frameKey(card.frameType)];
  const [ok, setOk] = useState(true);
  return (
    <button onClick={onRemove} onMouseEnter={onHover} title={`${card.name} — click to remove one`}
      className="cardimg" style={{ position: "relative", border: `1px solid ${shade(f.bg, 10)}`, borderRadius: 5, overflow: "hidden", padding: 0, aspectRatio: "0.686", background: `linear-gradient(155deg, ${shade(f.bg, 8)}, ${shade(f.bg, -36)})`, cursor: "pointer" }}>
      {ok ? (
        <img src={IMG(card.id, true)} alt={card.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={() => setOk(false)} />
      ) : (
        <div className="disp" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 8, color: f.fg, padding: "0 4px", textAlign: "center", lineHeight: 1.25 }}>{card.name}</div>
      )}
      {n > 1 && <span className="mono" style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,.78)", color: MD.gold, fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "0 4px" }}>×{n}</span>}
    </button>
  );
}

function CardTile({ card, badge, onClick, onHover }) {
  const f = FRAME[frameKey(card.frameType)];
  const rar = card.rarity ? RARITY[card.rarity] : null;
  const [ok, setOk] = useState(true);
  return (
    <button onClick={onClick} onMouseEnter={onHover} title={card.name}
      style={{ position: "relative", border: "none", background: "transparent", padding: 0 }}>
      <div className="cardimg" style={{ aspectRatio: "0.686", borderRadius: 5, overflow: "hidden", border: `1px solid ${f.bg}`, background: `linear-gradient(155deg, ${shade(f.bg, 10)}, ${shade(f.bg, -34)})` }}>
        {ok ? (
          <img src={IMG(card.id, true)} alt={card.name} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setOk(false)} />
        ) : (
          <div className="disp" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", textAlign: "center", fontSize: 8, color: f.fg, padding: "0 4px", lineHeight: 1.3 }}>{card.name}</div>
        )}
      </div>
      {rar && <span className="mono" style={{ position: "absolute", bottom: 2, left: 2, background: rar.c, color: "#1a1206", fontSize: 8, fontWeight: 700, borderRadius: 3, padding: "0 3px" }}>{rar.t}</span>}
      {badge > 0 && (
        <span className="mono" style={{ position: "absolute", top: 2, right: 2, background: MD.gold, color: "#1a1206", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "0 5px" }}>{badge}</span>
      )}
    </button>
  );
}

/* ---- 3D pop-out card: monster rises out of the frame & tilts ---------- */
function PopCard({ card, size = 158 }) {
  const ref = useRef(null);
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 30, on: false });
  const [imgOk, setImgOk] = useState(true);
  const f = FRAME[frameKey(card.frameType)];
  const w = size, h = size / 0.686;
  const art = IMG_CROP(card.id);

  const move = (e) => {
    if (REDUCED) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * 15, ry: (px - 0.5) * 15, gx: px * 100, gy: py * 100, on: true });
  };
  const leave = () => setT((s) => ({ ...s, rx: 0, ry: 0, on: false }));

  const statLine = card.atk != null
    ? `${card.type?.split(" ")[0] || ""} · ATK ${card.atk} / DEF ${card.def ?? "—"}`
    : (card.type || "");

  return (
    <div style={{ perspective: 950, width: w }}>
      <div ref={ref} onMouseMove={move} onMouseLeave={leave}
        style={{
          position: "relative", width: w, height: h, transformStyle: "preserve-3d",
          transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`,
          transition: t.on ? "none" : "transform .55s cubic-bezier(.2,.8,.2,1)",
        }}>
        {/* card body */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 11, overflow: "hidden",
          background: `linear-gradient(158deg, ${shade(f.bg, 18)}, ${shade(f.bg, -34)})`,
          border: `2px solid ${shade(f.bg, 40)}`,
          boxShadow: `0 ${12 + Math.abs(t.rx) + Math.abs(t.ry)}px 30px rgba(0,0,0,.55)`,
        }}>
          {/* recessed art slot (monster emerges from here) */}
          <div style={{ position: "absolute", left: "7%", right: "7%", top: "6%", height: "68%", borderRadius: 4, background: `radial-gradient(120% 90% at 50% 20%, ${shade(f.bg,-20)}, #05070b)`, boxShadow: "inset 0 6px 14px rgba(0,0,0,.6)" }} />
          {/* name / stat plate */}
          <div style={{ position: "absolute", left: "6%", right: "6%", top: "75.5%", bottom: "4.5%", background: "rgba(4,6,10,.5)", borderRadius: 4, padding: "5% 6%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontWeight: 800, fontSize: w * 0.082, color: f.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: ".01em" }}>{card.name}</div>
            <div className="mono" style={{ fontSize: w * 0.052, color: f.fg, opacity: .8, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {card.level != null ? `Lv/Rk ${card.level} · ` : ""}{statLine}
            </div>
          </div>
        </div>

        {/* POP-OUT monster — same art, floated forward and above the frame */}
        {imgOk ? (
          <img src={art} alt={card.name} onError={() => setImgOk(false)}
            style={{
              position: "absolute", left: "7%", right: "7%", top: "-16%", height: "90%",
              width: "86%", objectFit: "cover", objectPosition: "top", borderRadius: 4,
              transform: `translateZ(42px) rotateX(${t.rx * 0.25}deg) rotateY(${t.ry * 0.25}deg) scale(${t.on ? 1.03 : 1})`,
              transition: t.on ? "none" : "transform .55s cubic-bezier(.2,.8,.2,1)",
              filter: `drop-shadow(0 12px 12px rgba(0,0,0,.55))`,
              pointerEvents: "none",
              WebkitMaskImage: "linear-gradient(to bottom,#000 58%,transparent 90%)",
              maskImage: "linear-gradient(to bottom,#000 58%,transparent 90%)",
            }} />
        ) : (
          <div className="disp" style={{ position: "absolute", left: "7%", right: "7%", top: "6%", height: "68%", display: "grid", placeItems: "center", textAlign: "center", fontSize: w * 0.07, color: f.fg, opacity: .85, padding: "0 6%" }}>{card.name}</div>
        )}

        {/* holographic glare */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 11, pointerEvents: "none",
          background: `radial-gradient(circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,.35), transparent 46%)`,
          mixBlendMode: "overlay", opacity: t.on ? 1 : 0, transition: "opacity .3s",
        }} />
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  TEST HAND (goldfish)                                                   */
/* ====================================================================== */
function HandTester({ main }) {
  const [onPlay, setOnPlay] = useState(true);
  const [hand, setHand] = useState([]);
  const [deck, setDeck] = useState([]);
  const [drawn, setDrawn] = useState(0);

  const openingSize = onPlay ? 5 : 6;

  const newHand = useCallback(() => {
    const shuffled = shuffle([...main]);
    setHand(shuffled.slice(0, openingSize));
    setDeck(shuffled.slice(openingSize));
    setDrawn(0);
  }, [main, openingSize]);

  useEffect(() => { if (main.length) newHand(); }, [onPlay, main.length]); // reshuffle on toggle

  const drawOne = () => {
    if (!deck.length) return;
    setHand((h) => [...h, deck[0]]);
    setDeck((d) => d.slice(1));
    setDrawn((n) => n + 1);
  };

  if (!main.length) return <Center>Build a deck first — the Deck Editor tab.</Center>;

  return (
    <div style={{ padding: 20, height: "calc(100vh - 60px)", overflowY: "auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        <button onClick={newHand} className="disp" style={{ ...btn(), background: C.gold, color: "#1a1206", border: "none", fontSize: 12, padding: "9px 18px" }}>New Hand</button>
        <button onClick={drawOne} style={btn()} disabled={!deck.length}>Draw 1 ({deck.length} left)</button>
        <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
          {[["Going 1st", true], ["Going 2nd", false]].map(([l, v]) => (
            <button key={l} onClick={() => setOnPlay(v)} className="mono"
              style={{ fontSize: 11, padding: "8px 12px", border: "none", background: onPlay === v ? C.panel2 : "transparent", color: onPlay === v ? C.gold : C.mute }}>{l}</button>
          ))}
        </div>
        <span className="mono" style={{ color: C.mute, fontSize: 11, marginLeft: "auto" }}>
          opening {openingSize}{drawn ? ` +${drawn} drawn` : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", padding: "56px 0 40px" }}>
        {hand.map((c, i) => (
          <div key={i} style={{ transform: `rotate(${(i - (hand.length - 1) / 2) * 2.2}deg)`, transformOrigin: "bottom center" }}>
            <PopCard card={c} size={162} />
          </div>
        ))}
      </div>
      <p className="mono" style={{ textAlign: "center", color: C.mute, fontSize: 11 }}>
        Draw repeatedly to feel your deck's consistency, or jump to Probability for hard numbers.
      </p>
    </div>
  );
}

/* ====================================================================== */
/*  PROBABILITY (Monte-Carlo opening simulator)                           */
/* ====================================================================== */
function Probability({ main }) {
  const groups = useMemo(() => groupBy(main), [main]);
  const [starters, setStarters] = useState(() => new Set());
  const [handSize, setHandSize] = useState(5);
  const [trials, setTrials] = useState(100000);
  const [res, setRes] = useState(null);

  const toggle = (name) =>
    setStarters((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const run = () => {
    const deck = main.map((c) => (starters.has(c.name) ? 1 : 0));
    const N = deck.length;
    if (N < handSize) return;
    let openAtLeast1 = 0, brick = 0, sum = 0;
    const dist = [0, 0, 0, 0]; // 0,1,2,3+
    const arr = deck.slice();
    for (let t = 0; t < trials; t++) {
      // partial Fisher-Yates for the first handSize picks
      for (let i = 0; i < handSize; i++) {
        const j = i + Math.floor(Math.random() * (N - i));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      let k = 0;
      for (let i = 0; i < handSize; i++) k += arr[i];
      sum += k;
      if (k >= 1) openAtLeast1++; else brick++;
      dist[Math.min(k, 3)]++;
    }
    setRes({
      p1: (openAtLeast1 / trials) * 100,
      brick: (brick / trials) * 100,
      avg: sum / trials,
      dist: dist.map((d) => (d / trials) * 100),
      count: main.filter((c) => starters.has(c.name)).length,
    });
  };

  if (!main.length) return <Center>Build a deck first — the Deck Editor tab.</Center>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) minmax(300px,1fr)", height: "calc(100vh - 60px)" }}>
      <section style={{ borderRight: `1px solid ${C.line}`, overflowY: "auto", padding: 18 }}>
        <p className="disp" style={{ fontSize: 12, color: C.gold, marginBottom: 4 }}>1 · Mark your starters</p>
        <p style={{ fontSize: 12, color: C.mute, marginBottom: 14, lineHeight: 1.5 }}>
          Tick every card that, on its own, starts your combo (or that you want to open with). The simulator draws thousands of opening hands and measures how often you hit.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {groups.map(({ card, n }) => {
            const on = starters.has(card.name);
            return (
              <button key={card.name} onClick={() => toggle(card.name)}
                style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", background: on ? "rgba(232,184,75,.12)" : C.panel, border: `1px solid ${on ? C.gold : "transparent"}`, borderRadius: 6, padding: "5px 8px" }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? C.gold : C.line}`, background: on ? C.gold : "transparent", flexShrink: 0, color: "#1a1206", fontSize: 11, textAlign: "center", lineHeight: "13px" }}>{on ? "✓" : ""}</span>
                <img src={IMG(card.id, true)} alt="" width="22" height="32" style={{ borderRadius: 2, objectFit: "cover" }} onError={(e) => (e.target.style.visibility = "hidden")} />
                <span style={{ flex: 1, fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: on ? C.text : C.mute }}>{card.name}</span>
                <span className="mono" style={{ fontSize: 11, color: C.mute }}>×{n}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ padding: 18, overflowY: "auto" }}>
        <p className="disp" style={{ fontSize: 12, color: C.gold, marginBottom: 12 }}>2 · Run the sim</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <label className="mono" style={{ fontSize: 11, color: C.mute }}>hand
            <select value={handSize} onChange={(e) => setHandSize(+e.target.value)} style={{ ...inp(), marginLeft: 6 }}>
              {[5, 6].map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <label className="mono" style={{ fontSize: 11, color: C.mute }}>trials
            <select value={trials} onChange={(e) => setTrials(+e.target.value)} style={{ ...inp(), marginLeft: 6 }}>
              {[10000, 100000, 500000].map((t) => <option key={t} value={t}>{t.toLocaleString()}</option>)}
            </select>
          </label>
          <button onClick={run} className="disp" style={{ ...btn(), background: C.gold, color: "#1a1206", border: "none", padding: "9px 18px" }}>Simulate</button>
        </div>

        {!res && <p style={{ fontSize: 12, color: C.mute }}>Mark starters, then hit Simulate. Deck size in play: {main.length} cards.</p>}
        {res && res.count === 0 && <p style={{ fontSize: 12, color: C.bad }}>No starters selected.</p>}
        {res && res.count > 0 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <Stat label="Open ≥1 starter" val={res.p1} good />
              <Stat label="Brick (zero)" val={res.brick} bad />
            </div>
            <div className="mono" style={{ fontSize: 12, color: C.mute, marginBottom: 8 }}>
              {res.count} copies · avg {res.avg.toFixed(2)} starters per opening hand
            </div>
            <div style={{ marginTop: 10 }}>
              {res.dist.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 11, color: C.mute, width: 52 }}>{i === 3 ? "3+" : i} in hand</span>
                  <div style={{ flex: 1, height: 16, background: C.panel, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, height: "100%", background: i === 0 ? C.bad : C.gold, transition: "width .4s" }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: C.text, width: 46, textAlign: "right" }}>{p.toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <p className="mono" style={{ fontSize: 10.5, color: C.mute, marginTop: 16, lineHeight: 1.5 }}>
              Monte-Carlo over {trials.toLocaleString()} shuffles of your {main.length}-card main deck.
              Margin of error at 100k trials is well under ±0.5%.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, val, good, bad }) {
  const col = good ? C.good : bad ? C.bad : C.gold;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px" }}>
      <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: col, lineHeight: 1 }}>{val.toFixed(1)}<span style={{ fontSize: 15 }}>%</span></div>
      <div className="mono" style={{ fontSize: 10.5, color: C.mute, marginTop: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
    </div>
  );
}

/* ====================================================================== */
/*  DUEL BOARD — local hot-seat manual play                               */
/* ====================================================================== */
const PHASES = ["DP", "SP", "M1", "BP", "M2", "EP"];
const PHASE_FULL = { DP: "Draw", SP: "Standby", M1: "Main 1", BP: "Battle", M2: "Main 2", EP: "End" };
const clone = (o) => JSON.parse(JSON.stringify(o));
const isFieldSpell = (c) => /field/i.test(c.race || "") && /spell/i.test(c.type || "");
let UID = 0;
const mkInst = (c) => ({ uid: `i${UID++}`, card: c, pos: "atk", attacked: false });

/* tributes required to Normal Summon a main-deck monster of a given level */
const tributesFor = (card) => {
  if (isExtra(card.frameType) || /spell|trap/.test(card.frameType || "")) return 0;
  const lv = card.level ?? 0;
  return lv >= 7 ? 2 : lv >= 5 ? 1 : 0;
};

function buildSide(main, extra) {
  return {
    lp: 8000, normalSummoned: false,
    deck: shuffle(main.map(mkInst)),
    extra: extra.map(mkInst),
    hand: [], gy: [], banish: [],
    mzones: [null, null, null, null, null],
    szones: [null, null, null, null, null],
    field: null,
  };
}
/* clear per-turn flags for the player whose turn is starting */
function resetTurnFlags(n, p) {
  const pl = n.players[p];
  pl.normalSummoned = false;
  pl.mzones.forEach((m) => m && (m.attacked = false));
  n.emz.forEach((e) => e && e.owner === p && (e.inst.attacked = false));
}
function pull(n, s) {
  const pl = n.players[s.p]; let x = null;
  if (s.loc === "hand") x = pl.hand.splice(s.idx, 1)[0];
  else if (s.loc === "m") { x = pl.mzones[s.idx]; pl.mzones[s.idx] = null; }
  else if (s.loc === "s") { x = pl.szones[s.idx]; pl.szones[s.idx] = null; }
  else if (s.loc === "field") { x = pl.field; pl.field = null; }
  else if (s.loc === "gy") x = pl.gy.splice(s.idx, 1)[0];
  else if (s.loc === "banish") x = pl.banish.splice(s.idx, 1)[0];
  else if (s.loc === "deck") x = pl.deck.splice(s.idx, 1)[0];
  else if (s.loc === "extra") x = pl.extra.splice(s.idx, 1)[0];
  else if (s.loc === "emz") { const e = n.emz[s.idx]; n.emz[s.idx] = null; x = e ? e.inst : null; }
  return x;
}
function placeInst(n, p, kind, idx, inst, pos) {
  const pl = n.players[p];
  inst.pos = pos;
  if (kind === "m") pl.mzones[idx] = inst;
  else if (kind === "s") pl.szones[idx] = inst;
  else if (kind === "field") pl.field = inst;
  else if (kind === "emz") n.emz[idx] = { inst, owner: p };
}

function DuelBoard({ main, extra }) {
  const [game, setGame] = useState(null);
  const [sel, setSel] = useState(null);
  const [pending, setPending] = useState(null);
  const [attackFrom, setAttackFrom] = useState(null); // {p,loc,idx} of attacking monster
  const [hover, setHover] = useState(null);            // instance under the cursor
  const [viewer, setViewer] = useState(null);
  const [hideHands, setHideHands] = useState(false);
  const [dmg, setDmg] = useState(1000);
  const hist = useRef([]);

  const start = () => {
    UID = 0;
    const g = { turn: 1, active: 0, firstPlayer: 0, winner: null, phase: "M1",
      log: [{ t: 1, m: "Duel start — P1 goes first (no draw on turn 1)" }],
      emz: [null, null], players: [buildSide(main, extra), buildSide(main, extra)] };
    g.players.forEach((pl) => { for (let i = 0; i < 5; i++) pl.hand.push(pl.deck.shift()); });
    hist.current = []; setGame(g); setSel(null); setPending(null); setAttackFrom(null); setViewer(null);
  };
  const commit = (mut, msg) => {
    setGame((g) => {
      if (!g) return g;
      hist.current.push(clone(g)); if (hist.current.length > 50) hist.current.shift();
      const n = clone(g); mut(n);
      if (msg) n.log = [...n.log, { t: n.turn, m: msg }];
      // win condition: life points hit zero
      if (n.winner == null) {
        if (n.players[0].lp <= 0) { n.winner = 1; n.log.push({ t: n.turn, m: "🏆 P2 wins — P1's LP hit 0" }); }
        else if (n.players[1].lp <= 0) { n.winner = 0; n.log.push({ t: n.turn, m: "🏆 P1 wins — P2's LP hit 0" }); }
      }
      return n;
    });
    setSel(null); setPending(null); setAttackFrom(null);
  };
  const undo = () => { const p = hist.current.pop(); if (p) { setGame(p); setSel(null); setPending(null); setAttackFrom(null); } };

  if (!main.length) return <Center>Build a deck first — the Deck Editor tab.</Center>;
  if (!game) return (
    <div style={{ height: "calc(100vh - 60px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <p className="disp" style={{ color: C.gold, fontSize: 16, marginBottom: 8 }}>Duel · Hot Seat</p>
        <p style={{ color: C.mute, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
          Both sides start with your current deck ({main.length} main / {extra.length} extra), 8000 LP and a 5-card hand.
          The engine enforces the rules like Master Duel — turn/phase flow, the once-per-turn Normal Summon, tribute costs, battle damage, and win by LP-0 or deck-out.
          You still apply individual card <i>effects</i> yourself (that needs the full ygopro engine). Click any card for its legal actions.
        </p>
        <button onClick={start} className="disp" style={{ ...btn(), background: C.gold, color: "#1a1206", border: "none", padding: "12px 30px", fontSize: 14 }}>Start Duel</button>
      </div>
    </div>
  );

  const P = game.players;
  const you = game.active === 0;
  const plabel = (p) => (p === 0 ? "P1" : "P2");

  const zoneInst = (p, kind, idx) =>
    kind === "m" ? P[p].mzones[idx] : kind === "s" ? P[p].szones[idx] : kind === "field" ? P[p].field : kind === "emz" ? game.emz[idx]?.inst : null;
  const getInst = (s) => {
    if (!s) return null;
    const pl = P[s.p];
    return s.loc === "hand" ? pl.hand[s.idx] : s.loc === "gy" ? pl.gy[s.idx] : s.loc === "banish" ? pl.banish[s.idx]
      : s.loc === "deck" ? pl.deck[s.idx] : s.loc === "extra" ? pl.extra[s.idx] : zoneInst(s.p, s.loc, s.idx);
  };

  const isTrib = (p, kind, idx) => (pending?.tribs || []).some((t) => t.p === p && t.loc === kind && t.idx === idx);
  const tributesSatisfied = () => (pending?.tribs?.length || 0) >= (pending?.needTrib || 0);
  const canTribute = (p, kind, idx) => {
    if (!pending || pending.kind !== "mon" || !pending.needTrib) return false;
    if (tributesSatisfied()) return false;
    if (p !== pending.src.p) return false;
    if (!(kind === "m" || kind === "emz")) return false;
    return !!zoneInst(p, kind, idx) && !isTrib(p, kind, idx);
  };
  const canPlace = (p, kind, idx) => {
    if (!pending) return false;
    const pl = P[p];
    if (pending.kind === "mon") {
      if (!tributesSatisfied()) return false;
      const free = (occupied, k) => !occupied || isTrib(p, k, idx);
      return (kind === "m" && p === pending.src.p && free(pl.mzones[idx], "m")) ||
        (kind === "emz" && free(game.emz[idx], "emz"));
    }
    if (pending.kind === "st") return kind === "s" && p === pending.src.p && !pl.szones[idx];
    if (pending.kind === "field") return kind === "field" && p === pending.src.p && !pl.field;
    return false;
  };
  const addTribute = (p, kind, idx) =>
    setPending((prev) => ({ ...prev, tribs: [...(prev.tribs || []), { p, loc: kind, idx }] }));
  const finishPlace = (p, kind, idx) => {
    const inst = getInst(pending.src); const name = inst?.card.name || "card";
    const v = pending.pos === "set" ? "Set" : pending.normal ? "Normal Summoned" : "Special Summoned";
    const verb = pending.kind === "st" ? (pending.pos === "settrap" ? "Set" : "activated") : v;
    const src = pending.src, pos = pending.pos, normal = pending.normal, kindP = pending.kind, tribs = pending.tribs || [];
    commit((n) => {
      tribs.forEach((t) => { const x = pull(n, t); if (x) { x.pos = "atk"; n.players[t.p].gy.push(x); } });
      const x = pull(n, src); if (!x) return;
      x.attacked = false;
      placeInst(n, p, kind, idx, x, pos);
      if (normal && kindP === "mon") n.players[src.p].normalSummoned = true;
    }, `${plabel(src.p)} ${verb} ${name}${tribs.length ? ` (tributing ${tribs.length})` : ""}`);
  };
  /* -------- battle: attacker → target with auto damage calc -------- */
  const beginAttack = (s) => { setAttackFrom(s); setSel(null); setPending(null); };
  const atkTarget = (p, kind, idx) => {
    if (!attackFrom) return false;
    return p === 1 - attackFrom.p && (kind === "m" || kind === "emz") && !!zoneInst(p, kind, idx);
  };
  const oppMonsters = (opp) =>
    P[opp].mzones.some(Boolean) || game.emz.some((e) => e && e.owner === opp);

  const resolveAttack = (tSel) => {
    const aInst = getInst(attackFrom), tInst = getInst(tSel);
    if (!aInst || !tInst) { setAttackFrom(null); return; }
    const aP = attackFrom.p, tP = tSel.p, aAtk = aInst.card.atk ?? 0;
    const aName = aInst.card.name, tName = tInst.card.name;
    const bury = (n, s) => { const x = pull(n, s); if (x) { x.pos = "atk"; n.players[s.p].gy.push(x); } };
    /* resolve up front so we can log the outcome and mutate deterministically */
    let killA = false, killT = false, dmgTo = null, dmgAmt = 0, msg;
    if (tInst.pos === "atk") {
      const tAtk = tInst.card.atk ?? 0;
      if (aAtk > tAtk) { killT = true; dmgTo = tP; dmgAmt = aAtk - tAtk; msg = `⚔ ${aName} destroys ${tName} — ${plabel(tP)} takes ${dmgAmt}`; }
      else if (aAtk < tAtk) { killA = true; dmgTo = aP; dmgAmt = tAtk - aAtk; msg = `⚔ ${tName} survives — ${plabel(aP)} takes ${dmgAmt}`; }
      else { killA = killT = true; msg = `⚔ ${aName} and ${tName} destroy each other`; }
    } else { /* target set / defense — reveal and compare against DEF */
      const tDef = tInst.card.def ?? 0;
      if (aAtk > tDef) { killT = true; msg = `⚔ ${aName} destroys defending ${tName} (${aAtk} vs DEF ${tDef})`; }
      else if (aAtk < tDef) { dmgTo = aP; dmgAmt = tDef - aAtk; msg = `⚔ ${tName} holds (DEF ${tDef}) — ${plabel(aP)} takes ${dmgAmt}`; }
      else { msg = `⚔ ${aName} bounces off ${tName} (${aAtk} = DEF ${tDef})`; }
    }
    commit((n) => {
      const A = getInstMut(n, attackFrom); if (A) A.attacked = true;
      if (dmgTo != null) n.players[dmgTo].lp = Math.max(0, n.players[dmgTo].lp - dmgAmt);
      if (killT) bury(n, tSel);
      if (killA) bury(n, attackFrom);
    }, msg);
    setAttackFrom(null);
  };
  const directAttack = () => {
    const aInst = getInst(attackFrom); if (!aInst) { setAttackFrom(null); return; }
    const aP = attackFrom.p, oppP = 1 - aP, dealt = aInst.card.atk ?? 0;
    commit((n) => { const A = getInstMut(n, attackFrom); if (A) A.attacked = true; n.players[oppP].lp = Math.max(0, n.players[oppP].lp - dealt); },
      `⚔ ${aInst.card.name} attacks directly — ${plabel(oppP)} takes ${dealt}`);
    setAttackFrom(null);
  };

  const onZone = (p, kind, idx) => {
    if (attackFrom) { if (atkTarget(p, kind, idx)) resolveAttack({ p, loc: kind, idx }); return; }
    if (pending) {
      if (pending.kind === "mon" && !tributesSatisfied()) { if (canTribute(p, kind, idx)) addTribute(p, kind, idx); return; }
      if (canPlace(p, kind, idx)) finishPlace(p, kind, idx);
      return;
    }
    const inst = zoneInst(p, kind, idx);
    if (inst) setSel({ p, loc: kind, idx });
  };

  /* -------- action list for the selected card -------- */
  const move = (s, to, pos, msg) => commit((n) => { const x = pull(n, s); if (!x) return; const pl = n.players[s.p]; if (pos) x.pos = pos; pl[to][to === "deck" ? "unshift" : "push"](x); }, msg);
  const setPos = (s, pos, msg) => commit((n) => { const i = getInstMut(n, s); if (i) i.pos = pos; }, msg);
  const getInstMut = (n, s) => (s.loc === "m" ? n.players[s.p].mzones[s.idx] : s.loc === "s" ? n.players[s.p].szones[s.idx] : s.loc === "field" ? n.players[s.p].field : s.loc === "emz" ? n.emz[s.idx]?.inst : null);

  const actionsFor = (s) => {
    const inst = getInst(s); if (!inst) return [];
    const c = inst.card, name = c.name, P1 = plabel(s.p);
    const mon = frameKey(c.frameType) && !/spell|trap/.test(c.frameType);
    const isActive = s.p === game.active;
    const mainPhase = game.phase === "M1" || game.phase === "M2";
    const canMain = isActive && mainPhase && game.winner == null;
    const A = [];
    if (s.loc === "hand") {
      if (mon) {
        const need = tributesFor(c);
        const haveMon = P[s.p].mzones.filter(Boolean).length + game.emz.filter((e) => e && e.owner === s.p).length;
        const summoned = P[s.p].normalSummoned;
        const label = need ? `Tribute Summon — ${need} trib` : "Normal Summon (ATK)";
        if (!canMain) A.push({ l: "Normal Summon", disabled: true, hint: game.winner != null ? "game over" : !isActive ? "not your turn" : "Main Phase only" });
        else if (summoned) A.push({ l: "Normal Summon", disabled: true, hint: "already summoned this turn" });
        else if (need > haveMon) A.push({ l: `Tribute Summon`, disabled: true, hint: `needs ${need} tribute${need > 1 ? "s" : ""}` });
        else {
          A.push({ l: label, go: () => setPending({ kind: "mon", pos: "atk", normal: true, needTrib: need, tribs: [], src: s }) });
          A.push({ l: need ? `Tribute Set — ${need} trib` : "Normal Set (DEF)", go: () => setPending({ kind: "mon", pos: "set", normal: true, needTrib: need, tribs: [], src: s }) });
        }
        A.push({ l: "Special Summon (ATK)", go: () => setPending({ kind: "mon", pos: "atk", normal: false, needTrib: 0, tribs: [], src: s }) });
        A.push({ l: "Special Summon (DEF)", go: () => setPending({ kind: "mon", pos: "def", normal: false, needTrib: 0, tribs: [], src: s }) });
      } else if (/spell/i.test(c.type)) {
        A.push({ l: isFieldSpell(c) ? "Activate (Field)" : "Activate", go: () => setPending({ kind: isFieldSpell(c) ? "field" : "st", pos: "up", src: s }) });
        if (canMain) A.push({ l: "Set", go: () => setPending({ kind: "st", pos: "settrap", src: s }) });
        else A.push({ l: "Set", disabled: true, hint: "Main Phase only" });
      } else {
        if (canMain) A.push({ l: "Set", go: () => setPending({ kind: "st", pos: "settrap", src: s }) });
        else A.push({ l: "Set", disabled: true, hint: "Main Phase only" });
      }
      A.push({ l: "Discard to GY", go: () => move(s, "gy", "atk", `${P1} discarded ${name}`) });
      A.push({ l: "Banish", go: () => move(s, "banish", "atk", `${P1} banished ${name}`) });
      A.push({ l: "To Deck (top)", go: () => move(s, "deck", "atk", `${P1} sent ${name} to deck`) });
    } else if (s.loc === "m" || s.loc === "emz") {
      // battle: attack legality enforced (Battle Phase, your turn, not turn 1, once per monster)
      if (inst.pos === "atk") {
        if (game.winner != null) { /* no action */ }
        else if (game.phase !== "BP") A.push({ l: "⚔ Declare attack", disabled: true, hint: "Battle Phase only" });
        else if (!isActive) A.push({ l: "⚔ Declare attack", disabled: true, hint: "not your turn" });
        else if (game.turn === 1) A.push({ l: "⚔ Declare attack", disabled: true, hint: "no Battle Phase on turn 1" });
        else if (inst.attacked) A.push({ l: "⚔ Declare attack", disabled: true, hint: "already attacked" });
        else A.push({ l: "⚔ Declare attack", go: () => beginAttack(s) });
      }
      if (canMain) {
        if (inst.pos !== "atk") A.push({ l: "To ATK (face-up)", go: () => setPos(s, "atk", `${P1}: ${name} → ATK`) });
        if (inst.pos !== "def") A.push({ l: "To DEF (face-up)", go: () => setPos(s, "def", `${P1}: ${name} → DEF`) });
        if (inst.pos !== "set") A.push({ l: "Set (face-down DEF)", go: () => setPos(s, "set", `${P1} set a monster`) });
      }
      A.push({ l: "Send to GY", go: () => move(s, "gy", "atk", `${P1} sent ${name} to GY`) });
      A.push({ l: "Banish", go: () => move(s, "banish", "atk", `${P1} banished ${name}`) });
      A.push({ l: "Return to Hand", go: () => move(s, "hand", "atk", `${name} returned to hand`) });
      if (s.loc === "emz" || isExtra(c.frameType)) A.push({ l: "To Extra Deck", go: () => move(s, "extra", "atk", `${name} → Extra`) });
      else A.push({ l: "To Deck (top)", go: () => move(s, "deck", "atk", `${name} → deck`) });
    } else if (s.loc === "s" || s.loc === "field") {
      if (inst.pos === "settrap") A.push({ l: "Activate (flip up)", go: () => setPos(s, "up", `${P1} activated ${name}`) });
      A.push({ l: "Send to GY", go: () => move(s, "gy", "atk", `${P1} sent ${name} to GY`) });
      A.push({ l: "Banish", go: () => move(s, "banish", "atk", `${P1} banished ${name}`) });
      A.push({ l: "Return to Hand", go: () => move(s, "hand", "atk", `${name} returned to hand`) });
    } else { /* pile viewer cards */
      if (mon || isExtra(c.frameType)) {
        A.push({ l: "Special Summon (ATK)", go: () => { setPending({ kind: "mon", pos: "atk", normal: false, src: s }); setViewer(null); } });
        A.push({ l: "Special Summon (DEF)", go: () => { setPending({ kind: "mon", pos: "def", normal: false, src: s }); setViewer(null); } });
      }
      A.push({ l: "Add to Hand", go: () => { move(s, "hand", "atk", `${P1} added ${name} to hand`); setViewer(null); } });
      if (s.loc !== "gy") A.push({ l: "Send to GY", go: () => { move(s, "gy", "atk", `${name} → GY`); setViewer(null); } });
      if (s.loc !== "banish") A.push({ l: "Banish", go: () => { move(s, "banish", "atk", `${name} banished`); setViewer(null); } });
      if (s.loc !== "deck" && s.loc !== "extra") A.push({ l: "To Deck (top)", go: () => { move(s, "deck", "atk", `${name} → deck`); setViewer(null); } });
    }
    return A;
  };

  const drawCard = (p) => commit((n) => {
    const c = n.players[p].deck.shift();
    if (c) n.players[p].hand.push(c);
    else { n.winner = 1 - p; n.log.push({ t: n.turn, m: `🏆 ${plabel(1 - p)} wins — ${plabel(p)} decked out` }); }
  }, `${plabel(p)} drew a card`);
  const shuffleDeck = (p) => commit((n) => { shuffle(n.players[p].deck); }, `${plabel(p)} shuffled`);
  const changeLP = (p, d) => commit((n) => { n.players[p].lp = Math.max(0, n.players[p].lp + d); }, `${plabel(p)} LP ${d > 0 ? "+" : ""}${d}`);
  const setPhase = (ph) => { if (game.winner == null) commit((n) => { n.phase = ph; }, `→ ${PHASE_FULL[ph]} Phase`); };
  const endTurn = () => commit((n) => {
    const np = 1 - n.active;
    n.active = np; n.turn += 1; n.phase = "DP";
    resetTurnFlags(n, np);
    // Draw Phase — the incoming player always draws (turn-1 no-draw only applies to the opener)
    const c = n.players[np].deck.shift();
    if (c) n.players[np].hand.push(c);
    else { n.winner = 1 - np; n.log.push({ t: n.turn, m: `🏆 ${plabel(1 - np)} wins — ${plabel(np)} decked out` }); }
  }, `— ${plabel(1 - game.active)}'s turn (T${game.turn + 1}) · Draw Phase —`);
  /* advance one phase; auto-skips Battle Phase on turn 1 and ends the turn after End Phase */
  const nextPhase = () => {
    if (game.winner != null) return;
    if (game.phase === "EP") { endTurn(); return; }
    let ni = PHASES.indexOf(game.phase) + 1;
    if (PHASES[ni] === "BP" && game.turn === 1) ni++;   // opener has no Battle Phase
    const np = PHASES[ni];
    commit((n) => { n.phase = np; }, `→ ${PHASE_FULL[np]} Phase`);
  };
  const coin = () => commit(() => {}, `🪙 Coin: ${Math.random() < 0.5 ? "Heads" : "Tails"}`);
  const dice = () => commit(() => {}, `🎲 Dice: ${1 + Math.floor(Math.random() * 6)}`);

  const selInst = getInst(sel);
  const previewInst = hover || selInst;
  const attackerInst = getInst(attackFrom);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 272px", height: "calc(100vh - 60px)" }}>
      {/* ---- board ---- */}
      <div style={{ overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* HUD */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: C.panel, borderRadius: 8, padding: "7px 10px", position: "sticky", top: 0, zIndex: 5 }}>
          <span key={game.turn} className="disp turnbanner" style={{ fontSize: 12, color: C.gold }}>Turn {game.turn}</span>
          <span className="mono" style={{ fontSize: 11, color: you ? C.good : C.bad, border: `1px solid ${you ? C.good : C.bad}`, borderRadius: 20, padding: "2px 9px" }}>{you ? "P1's turn" : "P2's turn"}</span>
          <div style={{ display: "flex", gap: 2 }}>
            {PHASES.map((ph) => (
              <button key={ph} onClick={() => setPhase(ph)} title={PHASE_FULL[ph]} className="mono"
                style={{ fontSize: 10, padding: "4px 7px", borderRadius: 4, border: "none", background: game.phase === ph ? C.gold : C.panel2, color: game.phase === ph ? "#1a1206" : C.mute }}>{ph}</button>
            ))}
          </div>
          <button onClick={nextPhase} className="disp" style={{ ...miniBar(), background: C.good, color: "#07120b", border: "none" }}>{game.phase === "EP" ? "End Turn ▸" : `Next: ${PHASE_FULL[PHASES[Math.min(PHASES.indexOf(game.phase) + 1, 5)]]} ▸`}</button>
          <button onClick={endTurn} className="disp" style={{ ...miniBar(), background: C.panel2 }}>End Turn ⟳</button>
          <button onClick={undo} style={miniBar()}>↩ Undo</button>
          <button onClick={coin} style={miniBar()}>🪙</button>
          <button onClick={dice} style={miniBar()}>🎲</button>
          <button onClick={() => setHideHands((h) => !h)} style={miniBar()}>{hideHands ? "Show P2 hand" : "Hide P2 hand"}</button>
          <button onClick={start} style={{ ...miniBar(), color: C.bad }}>Reset</button>
        </div>

        {pending && (
          <div className="mono" style={{ background: "rgba(79,191,123,.12)", border: `1px solid ${C.good}`, color: C.good, borderRadius: 6, padding: "6px 10px", fontSize: 11.5, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>
              {pending.kind === "mon" && !tributesSatisfied()
                ? `Tribute Summon: pick ${pending.needTrib - (pending.tribs?.length || 0)} more monster${pending.needTrib - (pending.tribs?.length || 0) > 1 ? "s" : ""} to tribute for “${getInst(pending.src)?.card.name}”.`
                : `Select a highlighted zone to place “${getInst(pending.src)?.card.name}”.`}
            </span>
            <button onClick={() => { setPending(null); setSel(null); }} style={{ background: "none", border: "none", color: C.good, textDecoration: "underline" }}>cancel</button>
          </div>
        )}
        {attackFrom && (
          <div className="mono" style={{ background: "rgba(224,87,106,.12)", border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 6, padding: "6px 10px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>⚔ {attackerInst?.card.name} ({attackerInst?.card.atk ?? 0} ATK) is attacking — click a pulsing target{!oppMonsters(1 - attackFrom.p) ? "" : ""}.</span>
            <button onClick={directAttack} style={{ ...miniBar(), color: C.bad, borderColor: C.bad }}>Direct attack (−{attackerInst?.card.atk ?? 0})</button>
            <button onClick={() => setAttackFrom(null)} style={{ background: "none", border: "none", color: C.bad, textDecoration: "underline", marginLeft: "auto" }}>cancel</button>
          </div>
        )}

        {/* the duel mat — field in the middle, each player's half facing them */}
        <div style={{ flex: 1, borderRadius: 14, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6,
          background: `radial-gradient(70% 55% at 50% 0%, ${hexA(ZONE.st, 0.1)}, transparent 62%), radial-gradient(70% 55% at 50% 100%, ${hexA(ZONE.mon, 0.09)}, transparent 62%), linear-gradient(180deg, #0e1424 0%, #0a0f1b 50%, #0e1424 100%)`,
          border: `1px solid ${C.line}`, boxShadow: "inset 0 0 80px rgba(0,0,0,.62), 0 2px 20px rgba(0,0,0,.4)" }}>
          {/* opponent (P2) — rotated 180° so the whole half faces them across the table */}
          <div style={{ transform: "rotate(180deg)" }}>
            <PlayerField p={1} P={P} game={game} onZone={onZone} canPlace={canPlace} atkTarget={atkTarget} tribTarget={canTribute} isTrib={isTrib} attackFrom={attackFrom} sel={sel} setSel={setSel} setViewer={setViewer} setHover={setHover} drawCard={drawCard} shuffleDeck={shuffleDeck} changeLP={changeLP} dmg={dmg} hideHand={hideHands} />
          </div>
          <EMZRow game={game} onZone={onZone} canPlace={canPlace} atkTarget={atkTarget} tribTarget={canTribute} isTrib={isTrib} sel={sel} setHover={setHover} />
          {/* you (P1) — facing up toward the player */}
          <PlayerField p={0} P={P} game={game} onZone={onZone} canPlace={canPlace} atkTarget={atkTarget} tribTarget={canTribute} isTrib={isTrib} attackFrom={attackFrom} sel={sel} setSel={setSel} setViewer={setViewer} setHover={setHover} drawCard={drawCard} shuffleDeck={shuffleDeck} changeLP={changeLP} dmg={dmg} hideHand={false} />
        </div>
      </div>

      {/* ---- side panel: live preview + selected card actions + log ---- */}
      <div style={{ borderLeft: `1px solid ${C.line}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${C.line}` }}>
          {previewInst ? (
            <div style={{ display: "flex", gap: 10 }}>
              <img src={IMG(previewInst.card.id)} alt="" width="88" style={{ borderRadius: 5, objectFit: "cover", flexShrink: 0, background: C.panel2, alignSelf: "flex-start" }} onError={(e) => (e.target.style.visibility = "hidden")} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{previewInst.card.name}</div>
                <div className="mono" style={{ fontSize: 10, color: FRAME[frameKey(previewInst.card.frameType)].bg, marginTop: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  {previewInst.card.type || ""}{previewInst.card.level != null ? ` · Lv/Rk ${previewInst.card.level}` : ""}
                </div>
                {previewInst.card.atk != null && (
                  <div className="mono" style={{ fontSize: 11, color: C.gold, marginTop: 2 }}>ATK {previewInst.card.atk} / DEF {previewInst.card.def ?? "—"}</div>
                )}
                <div style={{ fontSize: 10.5, color: C.mute, marginTop: 6, lineHeight: 1.4, maxHeight: 96, overflowY: "auto" }}>{previewInst.card.desc}</div>
              </div>
            </div>
          ) : (
            <p className="mono" style={{ fontSize: 11, color: C.mute, lineHeight: 1.6 }}>Hover any card to preview it. Click one — hand, field, or a pile — for its actions. Declare an attack, then click a pulsing enemy monster to auto-resolve damage.</p>
          )}
          {selInst && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
              <div className="mono" style={{ fontSize: 9.5, color: C.mute, textTransform: "uppercase", letterSpacing: ".08em" }}>{plabel(sel.p)} · {sel.loc.toUpperCase()} — actions</div>
              {actionsFor(sel).map((a, i) => (
                <button key={a.l + i} onClick={a.disabled ? undefined : a.go} disabled={a.disabled}
                  style={{ textAlign: "left", background: a.disabled ? "transparent" : C.panel2, border: `1px solid ${a.disabled ? C.line : a.l[0] === "⚔" ? C.bad : C.line}`, color: a.disabled ? C.mute : a.l[0] === "⚔" ? C.bad : C.text, borderRadius: 5, padding: "6px 9px", fontSize: 11.5, cursor: a.disabled ? "not-allowed" : "pointer", opacity: a.disabled ? 0.6 : 1 }}>
                  {a.l}{a.disabled && a.hint ? ` — ${a.hint}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "8px 12px", flex: 1, overflowY: "auto", minHeight: 0 }}>
          <div className="disp" style={{ fontSize: 10, color: C.mute, marginBottom: 6 }}>Game Log</div>
          {[...game.log].reverse().map((e, i) => (
            <div key={i} className="mono" style={{ fontSize: 10.5, color: e.m.startsWith("—") ? C.gold : e.m[0] === "⚔" ? C.bad : C.text, opacity: e.m.startsWith("—") ? 1 : 0.88, padding: "2px 0", borderBottom: `1px solid ${C.panel}` }}>
              <span style={{ color: C.mute }}>T{e.t} </span>{e.m}
            </div>
          ))}
        </div>
      </div>

      {viewer && <PileViewer game={game} viewer={viewer} setViewer={setViewer} setSel={setSel} sel={sel} actionsFor={actionsFor} plabel={plabel} />}

      {game.winner != null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(4,7,12,.82)", zIndex: 60, display: "grid", placeItems: "center" }}>
          <div className="turnbanner" style={{ textAlign: "center", background: C.panel, border: `1px solid ${C.gold}`, borderRadius: 14, padding: "30px 44px", boxShadow: `0 0 40px ${C.goldDim}` }}>
            <div className="disp" style={{ fontSize: 13, color: C.mute, letterSpacing: ".2em" }}>DUEL OVER</div>
            <div className="disp" style={{ fontSize: 34, color: C.gold, margin: "8px 0 4px" }}>{plabel(game.winner)} WINS</div>
            <div className="mono" style={{ fontSize: 12, color: C.mute, marginBottom: 18 }}>{P[0].lp} — {P[1].lp}</div>
            <button onClick={start} className="disp" style={{ ...btn(), background: C.gold, color: "#1a1206", border: "none", padding: "10px 26px", fontSize: 13 }}>Rematch</button>
          </div>
        </div>
      )}
    </div>
  );
}

const miniBar = () => ({ background: "transparent", border: `1px solid ${C.line}`, color: C.text, borderRadius: 5, padding: "5px 9px", fontSize: 11 });

function DuelCard({ inst, onClick, onHover, selected, target, attacker }) {
  const c = inst.card, f = FRAME[frameKey(c.frameType)];
  const back = inst.pos === "set" || inst.pos === "settrap";
  const rot = inst.pos === "def" || inst.pos === "set";
  const isMon = !/spell|trap/.test(c.frameType || "");
  const bd = selected ? C.gold : attacker ? C.bad : target ? C.bad : shade(f.bg, 22);
  return (
    <button onClick={onClick} onMouseEnter={() => onHover?.(inst)} onMouseLeave={() => onHover?.(null)}
      title={c.name} className={target ? "dcard atktarget" : "dcard"}
      style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "grid", placeItems: "center", width: "100%", height: "100%" }}>
      <div style={{ position: "relative", width: 50, height: 73, borderRadius: 4, overflow: "hidden", transform: rot ? "rotate(90deg) scale(.82)" : "none",
        border: `2px solid ${bd}`, boxShadow: selected ? `0 0 10px ${C.gold}` : attacker ? `0 0 10px ${C.bad}` : "none", background: C.panel2 }}>
        {back ? (
          <div style={{ width: "100%", height: "100%", background: `repeating-linear-gradient(45deg, ${shade(f.bg, -18)} 0 4px, ${shade(f.bg, -34)} 4px 8px)`, display: "grid", placeItems: "center" }}>
            <div style={{ width: "40%", height: "40%", transform: "rotate(45deg)", background: `linear-gradient(${C.gold}, ${C.goldDim})`, borderRadius: 3, opacity: 0.85 }} />
          </div>
        ) : (
          <img src={IMG(c.id, true)} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => (e.target.style.opacity = 0)} />
        )}
        {!back && isMon && c.atk != null && (
          <span className="mono" style={{ position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 8, textAlign: "center", color: "#fff", background: "rgba(0,0,0,.62)", letterSpacing: ".02em" }}>
            {c.atk}/{c.def ?? "—"}
          </span>
        )}
      </div>
    </button>
  );
}

function Slot({ inst, valid, selected, target, attacker, trib, tribbed, tone = ZONE.mon, onClick, onHover, label }) {
  const bd = valid ? C.good : target ? C.bad : (trib || tribbed) ? C.gold : inst ? shade(tone, -6) : hexA(tone, 0.45);
  const bg = valid ? hexA(C.good, 0.18) : trib ? hexA(C.gold, 0.14)
    : `radial-gradient(120% 120% at 50% 35%, ${hexA(tone, 0.14)}, rgba(4,7,12,.5))`;
  return (
    <div onClick={onClick} className={target || trib ? "atktarget" : undefined}
      style={{ position: "relative", width: 52, height: 75, flexShrink: 0, borderRadius: 6, display: "grid", placeItems: "center",
        border: `1.5px solid ${bd}`, background: bg,
        boxShadow: tribbed ? `0 0 8px ${C.gold}` : inst ? "none" : `inset 0 0 10px ${hexA(tone, 0.18)}`,
        cursor: valid || target || trib || inst ? "pointer" : "default" }}>
      {inst ? <DuelCard inst={inst} onClick={onClick} onHover={onHover} selected={selected} target={target} attacker={attacker} />
        : <span className="mono" style={{ fontSize: 7.5, color: hexA(tone, 0.85), letterSpacing: ".06em", fontWeight: 700 }}>{label}</span>}
      {tribbed && <span className="mono" style={{ position: "absolute", top: 1, left: 2, fontSize: 8, fontWeight: 700, color: "#1a1206", background: C.gold, borderRadius: 3, padding: "0 3px" }}>TRB</span>}
    </div>
  );
}

function Pile({ label, list, onClick, onHover, accent }) {
  const top = list[list.length - 1];
  return (
    <button onClick={onClick} onMouseEnter={() => top && onHover?.(top)} onMouseLeave={() => onHover?.(null)}
      style={{ width: 52, height: 75, flexShrink: 0, border: `1px solid ${accent ? shade(accent, -30) : C.line}`, borderRadius: 5, background: C.panel, cursor: "pointer", position: "relative", overflow: "hidden", padding: 0 }}>
      {top && <img src={IMG(top.card.id, true)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} onError={(e) => (e.target.style.opacity = 0)} />}
      <span className="mono" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 8.5, color: accent || C.text, textShadow: "0 1px 3px #000", flexDirection: "column" }}>
        <b>{label}</b><br />{list.length}
      </span>
    </button>
  );
}

/* one player's half of the mat, laid out like a Master Duel play field:
   ┌ left col: Field Spell / Extra Deck ┐ ┌ centre: Monster row + Spell/Trap row ┐ ┌ right col: Deck / GY / Banish ┐
   with the hand + life points along the player's edge. Rendered identically
   for both players; the parent rotates P2's copy 180° so the monster rows meet
   in the centre and each hand faces its own player. */
function PlayerField({ p, P, game, onZone, canPlace, atkTarget, tribTarget, isTrib, attackFrom, sel, setSel, setViewer, setHover, drawCard, shuffleDeck, changeLP, dmg, hideHand }) {
  const pl = P[p];
  const active = p === game.active;
  const selMatch = (loc, idx) => sel && sel.p === p && sel.loc === loc && sel.idx === idx;
  const isAtkFrom = (loc, idx) => attackFrom && attackFrom.p === p && attackFrom.loc === loc && attackFrom.idx === idx;

  const monRow = [0, 1, 2, 3, 4].map((i) => (
    <Slot key={"m" + i} inst={pl.mzones[i]} tone={ZONE.mon} valid={canPlace(p, "m", i)} target={atkTarget(p, "m", i)} attacker={isAtkFrom("m", i)}
      trib={tribTarget(p, "m", i)} tribbed={isTrib(p, "m", i)}
      selected={selMatch("m", i)} onClick={() => onZone(p, "m", i)} onHover={setHover} label="M" />
  ));
  const stRow = [0, 1, 2, 3, 4].map((i) => (
    <Slot key={"s" + i} inst={pl.szones[i]} tone={ZONE.st} valid={canPlace(p, "s", i)} selected={selMatch("s", i)} onClick={() => onZone(p, "s", i)} onHover={setHover} label="S / T" />
  ));

  const leftCol = (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, justifyContent: "center" }}>
      <Slot inst={pl.field} tone={ZONE.field} valid={canPlace(p, "field", 0)} selected={selMatch("field", 0)} onClick={() => onZone(p, "field", 0)} onHover={setHover} label="FIELD" />
      <Pile label="EXTRA" list={pl.extra} onClick={() => setViewer({ p, pile: "extra" })} onHover={setHover} accent={C.gold} />
    </div>
  );
  const rightCol = (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => drawCard(p)} style={{ width: 52, height: 75, border: `1px solid ${C.gold}`, borderRadius: 5, background: `linear-gradient(160deg, ${shade(C.gold, -30)}, #1a130a)`, cursor: "pointer", color: C.gold }} className="mono" title="Draw a card">
          <div style={{ fontSize: 8 }}>DECK</div><div style={{ fontSize: 16, fontWeight: 700 }}>{pl.deck.length}</div><div style={{ fontSize: 7 }}>draw</div>
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
          <button onClick={() => shuffleDeck(p)} style={{ ...miniBar(), padding: "3px 6px" }} title="Shuffle deck">⤨</button>
          <button onClick={() => setViewer({ p, pile: "deck" })} style={{ ...miniBar(), padding: "3px 6px", fontSize: 9 }}>view</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <Pile label="GY" list={pl.gy} onClick={() => setViewer({ p, pile: "gy" })} onHover={setHover} />
        <Pile label="BANISH" list={pl.banish} onClick={() => setViewer({ p, pile: "banish" })} onHover={setHover} />
      </div>
    </div>
  );

  const lpPct = Math.max(0, Math.min(100, (pl.lp / 8000) * 100));
  const lpCol = pl.lp > 4000 ? C.good : pl.lp > 1500 ? C.gold : C.bad;
  const lp = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 6px", background: active ? hexA(C.gold, 0.07) : "rgba(0,0,0,.25)", borderRadius: 8, border: `1px solid ${active ? shade(C.gold, -40) : C.line}` }}>
      {/* avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div className="disp" style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, color: "#0b0e1a", background: `radial-gradient(circle at 35% 30%, ${shade(lpCol, 40)}, ${shade(lpCol, -30)})`, boxShadow: active ? `0 0 8px ${hexA(C.gold, 0.6)}` : "none" }}>{p === 0 ? "P1" : "P2"}</div>
      </div>
      {/* LP bar */}
      <div style={{ flex: 1, minWidth: 90 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="mono" style={{ fontSize: 8.5, color: C.mute, letterSpacing: ".14em" }}>LP</span>
          <span key={pl.lp} className="mono lpnum" style={{ fontSize: 16, fontWeight: 700, color: lpCol, lineHeight: 1 }}>{pl.lp}</span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: "rgba(0,0,0,.5)", overflow: "hidden", marginTop: 2, border: `1px solid ${hexA(lpCol, 0.3)}` }}>
          <div style={{ width: `${lpPct}%`, height: "100%", background: `linear-gradient(90deg, ${shade(lpCol, -20)}, ${lpCol})`, transition: "width .45s ease" }} />
        </div>
      </div>
      {/* quick damage + NS status */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => changeLP(p, -dmg)} style={{ ...miniBar(), color: C.bad, padding: "3px 6px", fontSize: 10 }}>−{dmg}</button>
        <button onClick={() => changeLP(p, dmg)} style={{ ...miniBar(), color: C.good, padding: "3px 6px", fontSize: 10 }}>+{dmg}</button>
        <span className="mono" style={{ fontSize: 8.5, color: pl.normalSummoned ? C.bad : C.good, whiteSpace: "nowrap" }}>{pl.normalSummoned ? "NS ✓" : "NS ○"}</span>
      </div>
    </div>
  );

  const hand = (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", minHeight: 74, padding: "3px 0" }}>
      {pl.hand.map((inst, i) =>
        hideHand ? (
          <div key={inst.uid} style={{ width: 50, height: 73, borderRadius: 4, background: `repeating-linear-gradient(45deg, ${shade(C.gold, -30)} 0 4px, #14100a 4px 8px)`, border: `1px solid ${C.line}` }} />
        ) : (
          <DuelCard key={inst.uid} inst={inst} onClick={() => setSel({ p, loc: "hand", idx: i })} onHover={setHover} selected={selMatch("hand", i)} />
        )
      )}
      {pl.hand.length === 0 && <span className="mono" style={{ fontSize: 10, color: C.mute, alignSelf: "center" }}>empty hand</span>}
    </div>
  );

  const board = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
      {leftCol}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 5 }}>{monRow}</div>
        <div style={{ display: "flex", gap: 5 }}>{stRow}</div>
      </div>
      {rightCol}
    </div>
  );

  return (
    <div style={{ background: active ? "rgba(232,184,75,.06)" : "transparent", borderRadius: 10, padding: "6px 8px", border: `1px solid ${active ? shade(C.gold, -45) : "transparent"}`, transition: "background .3s" }}>
      {board}
      {hand}
      {lp}
    </div>
  );
}

function EMZRow({ game, onZone, canPlace, atkTarget, tribTarget, isTrib, sel, setHover }) {
  return (
    <div style={{ display: "flex", gap: 34, justifyContent: "center", alignItems: "center", padding: "5px 0", borderTop: `1px solid ${hexA(ZONE.emz, 0.35)}`, borderBottom: `1px solid ${hexA(ZONE.emz, 0.35)}`, background: `linear-gradient(90deg, transparent, ${hexA(ZONE.emz, 0.06)}, transparent)` }}>
      <span className="mono" style={{ fontSize: 8, color: hexA(ZONE.emz, 0.85), letterSpacing: ".12em" }}>◄ EXTRA MONSTER ZONES</span>
      {[0, 1].map((i) => (
        <Slot key={i} inst={game.emz[i]?.inst} tone={ZONE.emz} valid={canPlace(0, "emz", i) || canPlace(1, "emz", i)}
          target={atkTarget(0, "emz", i) || atkTarget(1, "emz", i)}
          trib={tribTarget(0, "emz", i) || tribTarget(1, "emz", i)} tribbed={isTrib(0, "emz", i) || isTrib(1, "emz", i)}
          selected={sel && sel.loc === "emz" && sel.idx === i}
          onClick={() => { const e = game.emz[i]; onZone(e ? e.owner : (sel?.p ?? game.active), "emz", i); }} onHover={setHover} label="EMZ" />
      ))}
      <span className="mono" style={{ fontSize: 8, color: shade(C.good, 30), letterSpacing: ".12em" }}>SHARED ►</span>
    </div>
  );
}

function PileViewer({ game, viewer, setViewer, setSel, sel, actionsFor, plabel }) {
  const pl = game.players[viewer.p];
  const list = pl[viewer.pile] || [];
  const title = { gy: "Graveyard", banish: "Banished", deck: "Deck", extra: "Extra Deck" }[viewer.pile];
  const selHere = sel && sel.p === viewer.p && sel.loc === viewer.pile;
  return (
    <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 40, display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, width: "min(760px,92vw)", maxHeight: "84vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span className="disp" style={{ color: C.gold, fontSize: 13 }}>{plabel(viewer.p)} · {title} ({list.length})</span>
          <button onClick={() => setViewer(null)} style={miniBar()}>close</button>
        </div>
        <div style={{ display: "flex", gap: 14, minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(64px,1fr))", gap: 8, alignContent: "start" }}>
            {list.map((inst, i) => (
              <button key={inst.uid} onClick={() => setSel({ p: viewer.p, loc: viewer.pile, idx: i })}
                style={{ border: `2px solid ${selHere && sel.idx === i ? C.gold : "transparent"}`, borderRadius: 5, padding: 0, background: "none", cursor: "pointer" }}>
                <img src={IMG(inst.card.id, true)} alt={inst.card.name} style={{ width: "100%", borderRadius: 4, display: "block" }} onError={(e) => (e.target.style.opacity = 0)} />
              </button>
            ))}
            {list.length === 0 && <span className="mono" style={{ fontSize: 11, color: C.mute }}>empty</span>}
          </div>
          <div style={{ width: 180, flexShrink: 0, borderLeft: `1px solid ${C.line}`, paddingLeft: 12 }}>
            {selHere ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{pl[viewer.pile][sel.idx]?.card.name}</div>
                {actionsFor(sel).map((a) => (
                  <button key={a.l} onClick={a.go} style={{ textAlign: "left", background: C.panel2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 5, padding: "6px 9px", fontSize: 11.5 }}>{a.l}</button>
                ))}
              </div>
            ) : (
              <p className="mono" style={{ fontSize: 10.5, color: C.mute }}>Pick a card for actions.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- tiny ui atoms ---------------------------------------------------- */
function Center({ children }) {
  return <div style={{ height: "calc(100vh - 60px)", display: "grid", placeItems: "center", color: C.mute, fontSize: 14 }}>{children}</div>;
}
const inp = (grow, minW) => ({
  background: C.panel2, border: `1px solid ${C.line}`, color: C.text,
  borderRadius: 6, padding: "8px 10px", fontSize: 13, outline: "none",
  flex: grow ? 1 : "0 0 auto", minWidth: minW || "auto",
});
const btn = () => ({
  background: C.panel2, border: `1px solid ${C.line}`, color: C.text,
  borderRadius: 6, padding: "7px 12px", fontSize: 12.5,
});
const miniBtn = () => ({
  background: "transparent", border: `1px solid ${C.line}`, color: C.text,
  borderRadius: 4, width: 22, height: 22, fontSize: 14, lineHeight: 1, padding: 0,
});

/* fisher–yates */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
