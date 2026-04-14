import { useState, useMemo } from "react";
import { op, exp, ln, E, ZERO, sub, neg, add, mul, div, pow, recip } from "./eml.js";
import {
  exp_t, ln_t, sub_t, neg_t, add_t, mul_t, div_t, pow_t, recip_t, sqrt_t,
  E_t, mkVar, mkLit,
  countNodes, countDepth, bfsOrder, OPEN_CHALLENGES,
} from "./eml_tree.js";
import TreeViz from "./TreeViz.jsx";

// ─── Safe eval ────────────────────────────────────────────────────────────────
function safeEval(expr, x) {
  try {
    const clean = expr.trim();
    if (!/^[emlxadivosubnegpwrct\d\s.,()e\-+/*]+$/i.test(clean)) return null;
    const js = clean.replace(/\beml\b/g,"_op");
    const fn = new Function(
      "_op","exp","ln","neg","add","sub","mul","div","pow","recip","x",
      `"use strict"; return (${js});`
    );
    const r = fn(op,exp,ln,neg,add,sub,mul,div,pow,recip,x);
    return isFinite(r) ? r : null;
  } catch { return null; }
}

const fmt = v => {
  if (v === null || !isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 0.0001 || a >= 1e7) return v.toExponential(4);
  return parseFloat(v.toPrecision(8)).toString();
};
const fmtErr = e => {
  if (e === null || !isFinite(e)) return "—";
  if (e < 1e-14) return "< 1e−14";
  return e.toExponential(2);
};
const errCol = e => e === null ? C.muted : e < 1e-10 ? C.green : e < 1e-5 ? C.accent : C.red;

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg:"#07080f", surface:"#0d0e1c", border:"#191b2e",
  text:"#cdd0e0", muted:"#4e5168", accent:"#e8a020",
  blue:"#6ab0f5", green:"#5ec47a", red:"#e05060", tag:"#1a1c2e",
};

// ─── Identity catalogue ───────────────────────────────────────────────────────
const IDENTITIES = [
  { id:"exp",   name:"eˣ",    category:"core",
    emlForm:"eml(x, 1)",
    proof:"exp(x) − ln(1) = eˣ",
    nodes:1, depth:1, status:"verified",
    evalEml: x => op(x,1),   evalStd: x => Math.exp(x),
    domain:{ min:-3, max:3, default:1 }, xLabel:"x" },
  { id:"ln",    name:"ln x",  category:"core",
    emlForm:"eml(1, eml(eml(1,x), 1))",
    proof:"let s=e−ln(x); eml(s,1)=eᵉ/x; eml(1,eᵉ/x)=ln(x)",
    nodes:3, depth:3, status:"verified",
    evalEml: x => ln(x),     evalStd: x => Math.log(x),
    domain:{ min:0.01, max:10, default:2 }, xLabel:"x" },
  { id:"neg",   name:"−y",    category:"arithmetic",
    emlForm:"two-regime (see source)",
    proof:"Regime A(y≤0): tower formula. Regime B(y>0): 1−(y+1)=−y",
    nodes:9, depth:5, status:"proven",
    evalEml: x => neg(x),    evalStd: x => -x,
    domain:{ min:-10, max:10, default:3 }, xLabel:"y" },
  { id:"sub",   name:"x − y", category:"arithmetic",
    emlForm:"eml(ln(x), exp(y))",
    proof:"exp(ln(x)) − ln(exp(y)) = x − y",
    nodes:5, depth:4, status:"verified",
    evalEml: x => sub(x, 2), evalStd: x => x - 2,
    domain:{ min:0.01, max:10, default:5 }, xLabel:"x", note:"y fixed at 2" },
  { id:"add",   name:"x + y", category:"arithmetic",
    emlForm:"eml(ln(x), eml(neg(y), 1))",
    proof:"exp(ln(x)) − ln(exp(−y)) = x + y",
    nodes:11, depth:6, status:"proven",
    evalEml: x => add(x, 3), evalStd: x => x + 3,
    domain:{ min:0.01, max:10, default:2 }, xLabel:"x", note:"y fixed at 3" },
  { id:"mul",   name:"x × y", category:"arithmetic",
    emlForm:"eml(add(ln(x), ln(y)), 1)",
    proof:"exp(ln(x)+ln(y)) = xy",
    nodes:13, depth:7, status:"proven",
    evalEml: x => mul(x, 3), evalStd: x => x * 3,
    domain:{ min:0.01, max:10, default:2 }, xLabel:"x", note:"y fixed at 3" },
  { id:"div",   name:"x / y", category:"arithmetic",
    emlForm:"eml(add(ln(x), neg(ln(y))), 1)",
    proof:"exp(ln(x)−ln(y)) = x/y",
    nodes:15, depth:8, status:"proven",
    evalEml: x => div(x, 2), evalStd: x => x / 2,
    domain:{ min:0.01, max:10, default:6 }, xLabel:"x", note:"y fixed at 2" },
  { id:"pow",   name:"xⁿ",    category:"arithmetic",
    emlForm:"eml(mul(n, ln(x)), 1)",
    proof:"exp(n·ln(x)) = xⁿ",
    nodes:15, depth:8, status:"proven",
    evalEml: x => pow(x, 2), evalStd: x => Math.pow(x, 2),
    domain:{ min:0.01, max:10, default:3 }, xLabel:"x", note:"n fixed at 2" },
  { id:"recip", name:"1/x",   category:"arithmetic",
    emlForm:"eml(neg(ln(x)), 1)",
    proof:"exp(−ln(x)) = x⁻¹",
    nodes:5, depth:4, status:"proven",
    evalEml: x => recip(x),  evalStd: x => 1/x,
    domain:{ min:0.1, max:5, default:2 }, xLabel:"x" },
  { id:"e",     name:"e",     category:"constant",
    emlForm:"eml(1, 1)",
    proof:"exp(1) − ln(1) = e",
    nodes:1, depth:1, status:"verified",
    evalEml: () => op(1,1), evalStd: () => Math.E,
    domain:null, isConstant:true },
  { id:"zero",  name:"0",     category:"constant",
    emlForm:"eml(1, eml(eml(1,1), 1))",
    proof:"eml(1,1)=e → eml(e,1)=eᵉ → eml(1,eᵉ)=e−e=0",
    nodes:3, depth:3, status:"verified",
    evalEml: () => ZERO,    evalStd: () => 0,
    domain:null, isConstant:true },
];

const CATEGORIES = ["core","constant","arithmetic"];
const CAT_LABELS  = { core:"Core Functions", constant:"Constants", arithmetic:"Arithmetic" };

const STATUS_COL  = { verified: C.green, proven: C.blue, experimental: C.accent, open: C.muted };
const STATUS_SYM  = { verified:"✓", proven:"✓", experimental:"~", open:"?" };

const PRESETS = [
  { label:"eml(x,1)",          expr:"eml(x, 1)" },
  { label:"ln x",              expr:"eml(1, eml(eml(1, x), 1))" },
  { label:"neg(x)",            expr:"neg(x)" },
  { label:"add(x, 3)",         expr:"add(x, 3)" },
  { label:"mul(x, 2)",         expr:"mul(x, 2)" },
  { label:"pow(x, 3)",         expr:"pow(x, 3)" },
  { label:"div(10, x)",        expr:"div(10, x)" },
];

// ─── Mini bar chart for complexity ───────────────────────────────────────────
function ComplexityBar({ value, max=15, color=C.accent }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ flex:1, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${(value/max)*100}%`, height:"100%",
          background:color, borderRadius:2, transition:"width 0.3s" }}/>
      </div>
      <span style={{ fontSize:10, color:C.text, minWidth:14 }}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function App() {
  const [activeId,   setActiveId]   = useState("exp");
  const [xVal,       setXVal]       = useState(1.0);
  const [customExpr, setCustomExpr] = useState("pow(x, 3)");
  const [customX,    setCustomX]    = useState(2.0);
  const [tab,        setTab]        = useState("verify"); // verify | table | sandbox | tree
  const [treeExpr,   setTreeExpr]   = useState("pow(x, 3)");
  const [treeKey,    setTreeKey]    = useState(0); // increment to restart animation
  const [treeRoot,   setTreeRoot]   = useState(null);
  const [treeError,  setTreeError]  = useState(null);

  const buildTree = (expr) => {
    const clean = expr.trim();
    const challenge = OPEN_CHALLENGES.find(k => new RegExp(`\\b${k}\\b`).test(clean.toLowerCase()));
    if (challenge) {
      setTreeError(`"${challenge}" — no known EML construction under strict principal-branch grammar (open problem). Pull requests welcome.`);
      setTreeRoot(null);
      return;
    }
    if (!/^[emlxadivosubnegpwrctq\d\s.,()e\-+/*]+$/i.test(clean)) {
      setTreeError("Invalid expression. Use: exp ln neg add sub mul div pow recip sqrt eml x");
      setTreeRoot(null);
      return;
    }
    try {
      const X = mkVar("x");
      const ctx = {
        eml: (a, b) => ({ tag: "eml", left: a, right: b }),
        exp: exp_t, ln: ln_t, sub: sub_t, neg: neg_t,
        add: add_t, mul: mul_t, div: div_t, pow: pow_t,
        recip: recip_t, sqrt: sqrt_t,
        x: X, e: E_t,
      };
      const js = clean.replace(/\beml\b/g, "_eml");
      const fn = new Function(
        "_eml","exp","ln","neg","add","sub","mul","div","pow","recip","sqrt","x","e",
        `"use strict"; return (${js});`
      );
      const result = fn(
        ctx.eml, exp_t, ln_t, neg_t, add_t, sub_t, mul_t, div_t, pow_t, recip_t, sqrt_t, X, E_t
      );
      if (!result || typeof result !== "object" || !result.tag) throw new Error("bad result");
      setTreeRoot(result);
      setTreeError(null);
      setTreeKey(k => k + 1);
    } catch (err) {
      setTreeError("Could not build tree — check expression syntax.");
      setTreeRoot(null);
    }
  };

  const identity = IDENTITIES.find(i => i.id === activeId);

  const emlResult = identity.isConstant ? identity.evalEml() : (() => { try { const r = identity.evalEml(xVal); return isFinite(r)?r:null; } catch { return null; }})();
  const stdResult = identity.isConstant ? identity.evalStd() : (() => { try { const r = identity.evalStd(xVal); return isFinite(r)?r:null; } catch { return null; }})();
  const error     = (emlResult!==null && stdResult!==null) ? Math.abs(emlResult-stdResult) : null;

  const tableRows = useMemo(() => {
    if (!identity.domain) return [];
    const { min, max } = identity.domain;
    return [0, 0.25, 0.5, 0.75, 1].map(t => {
      const x = min + (max-min)*t;
      const s = (() => { try { const r = identity.evalStd(x); return isFinite(r)?r:null; } catch { return null; }})();
      const e = (() => { try { const r = identity.evalEml(x); return isFinite(r)?r:null; } catch { return null; }})();
      return { x, std:s, eml:e, err: s!==null&&e!==null ? Math.abs(s-e) : null };
    });
  }, [identity, xVal]);

  const customResult = safeEval(customExpr, customX);

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text,
      fontFamily:"'Space Mono', monospace", padding:"20px 16px",
      maxWidth:780, margin:"0 auto", boxSizing:"border-box" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing:border-box; }
        input[type=range]{-webkit-appearance:none;width:100%;height:3px;border-radius:2px;
          background:#1c1e30;outline:none;cursor:pointer;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;
          border-radius:50%;background:#e8a020;cursor:pointer;}
        input[type=text]{outline:none;}
        button{cursor:pointer;font-family:'Space Mono',monospace;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#2a2c40;border-radius:2px;}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:16, marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:C.accent, letterSpacing:"-0.02em" }}>
              EML Explorer
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
              eml(x,y) = exp(x) − ln(y) · Odrzywołek 2026 · arXiv:2603.21852
            </div>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {["verify","table","sandbox","tree"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:"5px 12px", fontSize:10, borderRadius:4, textTransform:"uppercase",
                letterSpacing:"0.06em",
                background: tab===t ? "rgba(232,160,32,0.12)" : "transparent",
                border:`1px solid ${tab===t ? C.accent : C.border}`,
                color: tab===t ? C.accent : C.muted,
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── TAB: VERIFY ── */}
      {tab === "verify" && (
        <div>
          {/* Category tabs */}
          {CATEGORIES.map(cat => {
            const items = IDENTITIES.filter(i => i.category === cat);
            return (
              <div key={cat} style={{ marginBottom:16 }}>
                <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em",
                  textTransform:"uppercase", marginBottom:8 }}>{CAT_LABELS[cat]}</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {items.map(i => (
                    <button key={i.id}
                      onClick={() => { setActiveId(i.id); if(i.domain) setXVal(i.domain.default); }}
                      style={{
                        padding:"6px 14px", fontSize:12, borderRadius:4,
                        background: i.id===activeId ? "rgba(232,160,32,0.12)" : C.tag,
                        border:`1px solid ${i.id===activeId ? C.accent : C.border}`,
                        color: i.id===activeId ? C.accent : C.text,
                      }}>
                      {i.name}
                      <span style={{ marginLeft:5, fontSize:9,
                        color: STATUS_COL[i.status] ?? C.muted }}>
                        {STATUS_SYM[i.status]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Active identity card */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, padding:16, marginBottom:12 }}>

            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start", gap:12, flexWrap:"wrap", marginBottom:14 }}>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:15, color:C.accent, marginBottom:6, wordBreak:"break-all" }}>
                  {identity.emlForm}
                </div>
                <div style={{ fontSize:10, color:C.muted, lineHeight:1.8, fontStyle:"italic" }}>
                  {identity.proof}
                </div>
                {identity.note && (
                  <div style={{ fontSize:9, color:C.muted, marginTop:6 }}>
                    ⚠ {identity.note}
                  </div>
                )}
              </div>
              <div style={{ width:130, flexShrink:0 }}>
                <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.08em",
                  textTransform:"uppercase", marginBottom:8 }}>complexity</div>
                <div style={{ fontSize:9, color:C.muted, marginBottom:4 }}>
                  nodes
                </div>
                <ComplexityBar value={identity.nodes} color={C.accent} />
                <div style={{ fontSize:9, color:C.muted, marginTop:8, marginBottom:4 }}>
                  depth
                </div>
                <ComplexityBar value={identity.depth} max={10} color={C.blue} />
                <div style={{ marginTop:8, fontSize:9,
                  color: STATUS_COL[identity.status] }}>
                  {identity.status.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Constant display */}
            {identity.isConstant ? (
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    { label:"standard", val:stdResult, col:C.blue },
                    { label:"EML",      val:emlResult, col:C.accent },
                  ].map(({ label, val, col }) => (
                    <div key={label} style={{ background:C.bg,
                      border:`1px solid ${C.border}`, borderRadius:5, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase",
                        letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
                      <div style={{ color:col, fontSize:13 }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:8, fontSize:10, color:C.green }}>
                  ✓ error: {Math.abs(stdResult - emlResult).toExponential(2)}
                </div>
              </div>
            ) : (
              /* Slider + live comparison */
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  fontSize:10, marginBottom:6 }}>
                  <span style={{ color:C.muted }}>
                    {identity.xLabel} = <span style={{ color:C.text }}>{xVal.toFixed(4)}</span>
                  </span>
                  <span style={{ color: errCol(error) }}>
                    {error !== null
                      ? (error < 1e-13 ? "error < 1e−13 ✓" : `error: ${fmtErr(error)}`)
                      : "domain error"}
                  </span>
                </div>
                <input type="range"
                  min={identity.domain.min} max={identity.domain.max} step={0.001}
                  value={xVal} onChange={e => setXVal(parseFloat(e.target.value))} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10 }}>
                  {[
                    { label:"standard", val:stdResult, col:C.blue },
                    { label:"EML",      val:emlResult, col:C.accent },
                  ].map(({ label, val, col }) => (
                    <div key={label} style={{ background:C.bg,
                      border:`1px solid ${C.border}`, borderRadius:5, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase",
                        letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
                      <div style={{ color:col, fontSize:14 }}>{fmt(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Verification table */}
          {!identity.isConstant && tableRows.length > 0 && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`,
              borderRadius:8, overflow:"hidden" }}>
              <div style={{ display:"grid", gridTemplateColumns:"0.7fr 1.3fr 1.3fr 1fr",
                padding:"7px 14px", borderBottom:`1px solid ${C.border}`,
                fontSize:9, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>
                {[identity.xLabel,"standard","EML","|error|"].map(h=><div key={h}>{h}</div>)}
              </div>
              {tableRows.map((row,i) => (
                <div key={i} style={{
                  display:"grid", gridTemplateColumns:"0.7fr 1.3fr 1.3fr 1fr",
                  padding:"6px 14px", fontSize:11,
                  borderBottom: i<tableRows.length-1 ? `1px solid ${C.border}` : "none",
                  background: i%2===0 ? "transparent" : "rgba(255,255,255,0.012)"
                }}>
                  <div style={{ color:C.muted }}>{row.x.toFixed(3)}</div>
                  <div style={{ color:C.blue }}>{fmt(row.std)}</div>
                  <div style={{ color:C.accent }}>{fmt(row.eml)}</div>
                  <div style={{ color:errCol(row.err) }}>{fmtErr(row.err)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TABLE ── */}
      {tab === "table" && (
        <div>
          <div style={{ fontSize:10, color:C.muted, marginBottom:14, lineHeight:1.8 }}>
            EML complexity table — node count and depth per identity.
            This ranking of elementary functions by tree depth is new to mathematics.
          </div>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, overflow:"hidden" }}>
            <div style={{ display:"grid",
              gridTemplateColumns:"1.2fr 2fr 0.6fr 0.6fr 0.8fr",
              padding:"8px 14px", borderBottom:`1px solid ${C.border}`,
              fontSize:9, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>
              {["Function","EML form","Nodes","Depth","Status"].map(h=><div key={h}>{h}</div>)}
            </div>
            {IDENTITIES.map((id, i) => (
              <div key={id.id} style={{
                display:"grid", gridTemplateColumns:"1.2fr 2fr 0.6fr 0.6fr 0.8fr",
                padding:"9px 14px", fontSize:11, alignItems:"center",
                borderBottom: i<IDENTITIES.length-1 ? `1px solid ${C.border}` : "none",
                background: i%2===0 ? "transparent" : "rgba(255,255,255,0.012)",
                cursor:"pointer"
              }} onClick={() => { setActiveId(id.id); setTab("verify"); if(id.domain) setXVal(id.domain.default); }}>
                <div style={{ color:C.accent }}>{id.name}</div>
                <div style={{ color:C.muted, fontSize:9, wordBreak:"break-all" }}>{id.emlForm}</div>
                <div>
                  <ComplexityBar value={id.nodes} color={C.accent} />
                </div>
                <div>
                  <ComplexityBar value={id.depth} max={10} color={C.blue} />
                </div>
                <div style={{ fontSize:9, color: STATUS_COL[id.status] }}>
                  {STATUS_SYM[id.status]} {id.status}
                </div>
              </div>
            ))}
            {/* Open challenges */}
            {["sin x","cos x","tan x","π","i"].map((name,i) => (
              <div key={name} style={{
                display:"grid", gridTemplateColumns:"1.2fr 2fr 0.6fr 0.6fr 0.8fr",
                padding:"9px 14px", fontSize:11, alignItems:"center",
                borderBottom: i<4 ? `1px solid ${C.border}` : "none",
                background: "rgba(78,81,104,0.06)"
              }}>
                <div style={{ color:C.muted }}>{name}</div>
                <div style={{ color:C.muted, fontSize:9 }}>— open challenge —</div>
                <div style={{ color:C.muted, fontSize:9 }}>?</div>
                <div style={{ color:C.muted, fontSize:9 }}>?</div>
                <div style={{ fontSize:9, color:C.muted }}>? open</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:10, fontSize:9, color:C.muted, lineHeight:1.8 }}>
            Click any row to jump to its verification. · Open challenges welcome — open a PR.
          </div>
        </div>
      )}

      {/* ── TAB: SANDBOX ── */}
      {tab === "sandbox" && (
        <div>
          <div style={{ fontSize:10, color:C.muted, marginBottom:14, lineHeight:1.8 }}>
            Compose your own EML expression. Available:{" "}
            {["eml","exp","ln","neg","add","sub","mul","div","pow","recip","x"].map(fn => (
              <span key={fn} style={{ color:C.accent, marginRight:6 }}>{fn}</span>
            ))}
          </div>

          <div style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, padding:16, marginBottom:12 }}>
            {/* Presets */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => setCustomExpr(p.expr)} style={{
                  fontSize:10, padding:"4px 10px",
                  background: customExpr===p.expr ? "rgba(232,160,32,0.12)" : C.tag,
                  border:`1px solid ${customExpr===p.expr ? C.accent : C.border}`,
                  color: customExpr===p.expr ? C.accent : C.muted, borderRadius:3 }}>
                  {p.label}
                </button>
              ))}
            </div>

            <input type="text" value={customExpr}
              onChange={e => setCustomExpr(e.target.value)}
              style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`,
                borderRadius:4, color:C.accent, padding:"9px 12px", fontSize:13,
                fontFamily:"'Space Mono',monospace", marginBottom:14 }} />

            <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  fontSize:10, color:C.muted, marginBottom:6 }}>
                  <span>x</span>
                  <span style={{ color:C.text }}>{customX.toFixed(4)}</span>
                </div>
                <input type="range" min={0.01} max={10} step={0.001}
                  value={customX} onChange={e => setCustomX(parseFloat(e.target.value))} />
              </div>
              <div style={{
                minWidth:120, padding:"12px 20px", borderRadius:6,
                textAlign:"center", fontSize:15, fontWeight:700,
                background: customResult!==null ? "rgba(94,196,122,0.07)" : "rgba(224,80,96,0.07)",
                border:`1px solid ${customResult!==null ? C.green : C.red}`,
                color: customResult!==null ? C.green : C.red,
              }}>
                {customResult !== null ? fmt(customResult) : "error"}
              </div>
            </div>
          </div>

          {/* Sweep table for custom expr */}
          {customResult !== null && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`,
              borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:"7px 14px", borderBottom:`1px solid ${C.border}`,
                fontSize:9, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>
                sweep x across [0.1 → 10]
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)" }}>
                {[0.1, 1, 2.5, 5, 10].map((x, i) => {
                  const r = safeEval(customExpr, x);
                  return (
                    <div key={x} style={{
                      padding:"10px 12px", textAlign:"center",
                      borderRight: i<4 ? `1px solid ${C.border}` : "none",
                    }}>
                      <div style={{ fontSize:9, color:C.muted, marginBottom:5 }}>x={x}</div>
                      <div style={{ fontSize:12, color: r!==null ? C.accent : C.red }}>
                        {r !== null ? fmt(r) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TREE ── */}
      {tab === "tree" && (
        <div>
          <div style={{ fontSize:10, color:C.muted, marginBottom:14, lineHeight:1.8 }}>
            Type any EML expression and watch it decompose into a branching tree.
            Every internal node is one{" "}<span style={{ color:C.accent }}>eml(·,·)</span>{" "}call.
            Leaves are terminals:{" "}<span style={{ color:C.blue }}>1</span>,{" "}
            <span style={{ color:C.blue }}>x</span>, numeric literals.
          </div>

          {/* Input row */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, padding:16, marginBottom:12 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
              {[
                "exp(x)", "ln(x)", "mul(x, x)", "pow(x, 3)",
                "add(2, 3)", "recip(x)", "sqrt(x)", "div(x, 2)",
              ].map(preset => (
                <button key={preset}
                  onClick={() => { setTreeExpr(preset); buildTree(preset); }}
                  style={{
                    fontSize:10, padding:"4px 10px",
                    background: treeExpr === preset ? "rgba(232,160,32,0.12)" : C.tag,
                    border:`1px solid ${treeExpr === preset ? C.accent : C.border}`,
                    color: treeExpr === preset ? C.accent : C.muted, borderRadius:3,
                  }}>
                  {preset}
                </button>
              ))}
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <input type="text" value={treeExpr}
                onChange={e => setTreeExpr(e.target.value)}
                onKeyDown={e => e.key === "Enter" && buildTree(treeExpr)}
                placeholder="e.g. pow(x, 3)"
                style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`,
                  borderRadius:4, color:C.accent, padding:"9px 12px", fontSize:13,
                  fontFamily:"'Space Mono',monospace" }} />
              <button onClick={() => buildTree(treeExpr)} style={{
                padding:"9px 20px", fontSize:11, fontWeight:700,
                background:"rgba(232,160,32,0.15)", border:`1px solid ${C.accent}`,
                color:C.accent, borderRadius:4, letterSpacing:"0.04em",
              }}>
                BUILD
              </button>
            </div>
          </div>

          {/* Error message */}
          {treeError && (
            <div style={{ background:"rgba(224,80,96,0.08)", border:`1px solid ${C.red}`,
              borderRadius:6, padding:"10px 14px", marginBottom:12,
              fontSize:11, color:C.red, lineHeight:1.7 }}>
              {treeError}
            </div>
          )}

          {/* Stats + Tree */}
          {treeRoot && !treeError && (() => {
            const nodes = countNodes(treeRoot);
            const depth = countDepth(treeRoot);
            const done  = bfsOrder(treeRoot).length;
            return (
              <div>
                <div style={{ display:"flex", gap:20, marginBottom:14 }}>
                  {[
                    { label:"Nodes", value: nodes, color: C.accent },
                    { label:"Depth", value: depth, color: C.blue },
                    { label:"eml calls", value: Math.floor(nodes / 2), color: C.green },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background:C.surface,
                      border:`1px solid ${C.border}`, borderRadius:6,
                      padding:"8px 16px", textAlign:"center" }}>
                      <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.08em",
                        textTransform:"uppercase", marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:22, fontWeight:700, color }}>{value}</div>
                    </div>
                  ))}
                  <button onClick={() => setTreeKey(k => k + 1)} style={{
                    marginLeft:"auto", padding:"8px 16px", fontSize:10,
                    background:"transparent", border:`1px solid ${C.border}`,
                    color:C.muted, borderRadius:6, letterSpacing:"0.04em",
                    alignSelf:"center",
                  }}>
                    REPLAY ↺
                  </button>
                </div>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`,
                  borderRadius:8, padding:16, overflowX:"auto" }}>
                  <TreeViz root={treeRoot} animKey={treeKey} />
                </div>
                <div style={{ marginTop:8, fontSize:9, color:C.muted }}>
                  orange = eml operator node · blue = terminal (1, x, literal)
                </div>
              </div>
            );
          })()}

          {/* Empty state — shown before first build */}
          {!treeRoot && !treeError && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`,
              borderRadius:8, padding:"40px 16px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:C.muted }}>
                Type an expression above and press BUILD to render its EML tree.
              </div>
              <div style={{ marginTop:8, fontSize:9, color:C.muted }}>
                Try: <span style={{ color:C.accent }}>pow(x, 3)</span> — 15 nodes, depth 8
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop:20, paddingTop:14, borderTop:`1px solid ${C.border}`,
        fontSize:9, color:C.muted, display:"flex", justifyContent:"space-between",
        flexWrap:"wrap", gap:6 }}>
        <span>Odrzywołek (2026) · arXiv:2603.21852v2 · CC BY 4.0</span>
        <span>github.com/almaguer1986/monogate</span>
      </div>
    </div>
  );
}
