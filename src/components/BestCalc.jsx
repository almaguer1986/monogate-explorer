import { useState, useEffect, useRef } from "react";
import { evalExpr } from "../calc-engine.js";

// ── Colors (matches App.jsx) ───────────────────────────────────────────────────
const C = {
  bg: "#07080f", surface: "#0d0e1c", border: "#191b2e",
  text: "#cdd0e0", muted: "#4e5168", accent: "#e8a020",
  blue: "#6ab0f5", green: "#5ec47a", red: "#e05060", tag: "#1a1c2e",
};

const PILL = {
  EML:     { bg: "rgba(124,111,247,0.14)", border: "#7c6ff7", color: "#a09cf7" },
  EDL:     { bg: "rgba(45,212,191,0.10)", border: "#2dd4bf", color: "#2dd4bf" },
  EXL:     { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", color: "#f5b435" },
};

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(v) {
  if (v === null || !isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 0.0001 || a >= 1e7) return v.toExponential(6);
  return parseFloat(v.toPrecision(10)).toString();
}

function fmtErr(e) {
  if (e === null || !isFinite(e)) return "—";
  if (e === 0 || e < 5e-17) return "< 5e−17";
  if (e < 1e-14) return "< 1e−14";
  return e.toExponential(2);
}

// ── Quick-insert buttons ──────────────────────────────────────────────────────
const QUICK = [
  { label: "sin(x)",   ins: "sin(x)" },
  { label: "cos(x)",   ins: "cos(x)" },
  { label: "exp(x)",   ins: "exp(x)" },
  { label: "ln(x)",    ins: "ln(x)"  },
  { label: "x²",       ins: "x^2"   },
  { label: "x³",       ins: "x^3"   },
  { label: "1/x",      ins: "1/x"   },
  { label: "x·ln(x)",  ins: "x*ln(x)" },
];

const PRESETS = [
  { label: "sin(x)+cos(x)",   expr: "sin(x)+cos(x)"   },
  { label: "exp(x)·ln(x+1)",  expr: "exp(x)*ln(x+1)"  },
  { label: "x³+2·x",          expr: "x^3+2*x"          },
  { label: "sin(x)/x",        expr: "sin(x)/x"          },
  { label: "pow(x,4)−x²",     expr: "pow(x,4)-x^2"     },
];

const MODES = [
  { id: "best", label: "✦ BEST" },
  { id: "eml",  label: "EML"   },
  { id: "exl",  label: "EXL"   },
  { id: "edl",  label: "EDL"   },
];

const MODE_DESC = {
  best: "Routes each op to its optimal operator — 52% fewer nodes on average",
  eml:  "Pure EML — exp(x)−ln(y) for every node",
  exl:  "EXL only — exp(x)·ln(y) — excels at ln and pow, incomplete for add/sub",
  edl:  "EDL only — exp(x)/ln(y) — excels at div and mul, requires e as constant",
};

// ── OperatorPill ──────────────────────────────────────────────────────────────
function OpPill({ op }) {
  const s = PILL[op] || PILL.EML;
  return (
    <span style={{
      fontSize: 9, padding: "1px 6px", borderRadius: 3,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontWeight: 700, letterSpacing: "0.04em",
    }}>{op}</span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BestCalc() {
  const [expr,      setExpr]      = useState("sin(x)");
  const [xVal,      setXVal]      = useState(1.0);
  const [mode,      setMode]      = useState("best");
  const [result,    setResult]    = useState(null);
  const [evalError, setEvalError] = useState(null);
  const [showTree,  setShowTree]  = useState(false);
  const inputRef = useRef(null);

  // ── Debounced evaluation ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (!expr.trim()) { setResult(null); setEvalError(null); return; }
      const r = evalExpr(expr, xVal, mode);
      if (!r) { setResult(null); setEvalError(null); return; }
      if (r.error) { setEvalError(r.error); setResult(null); }
      else          { setResult(r);         setEvalError(null); }
    }, 150);
    return () => clearTimeout(t);
  }, [expr, xVal, mode]);

  const hasX     = /\bx\b/.test(expr);
  const savings  = result && result.emlNodes && mode === "best"
    ? Math.round((1 - result.totalNodes / result.emlNodes) * 100)
    : 0;
  const maxNodes = result ? Math.max(...result.nodeLog.map(e => e.nodes), 1) : 1;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const handleInsert = (text) => {
    const v = expr.trim();
    setExpr(v === "" ? text : v + text);
    inputRef.current?.focus();
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: 16, marginBottom: 12,
  };

  const btnBase = {
    padding: "5px 12px", fontSize: 10, borderRadius: 4, border: `1px solid ${C.border}`,
    background: "transparent", color: C.muted, cursor: "pointer",
    fontFamily: "'Space Mono', monospace", letterSpacing: "0.04em",
    transition: "border-color 0.15s, color 0.15s",
  };

  const btnActive = { ...btnBase,
    background: "rgba(232,160,32,0.10)", border: `1px solid ${C.accent}`,
    color: C.accent,
  };

  const quickBtn = {
    ...btnBase, padding: "4px 10px", fontSize: 10,
    background: C.tag,
  };

  return (
    <div>
      {/* Mode selector */}
      <div style={{ ...card, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {MODES.map(m => (
              <button key={m.id}
                onClick={() => setMode(m.id)}
                style={mode === m.id ? btnActive : btnBase}>
                {m.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>
            {MODE_DESC[mode]}
          </span>
        </div>
      </div>

      {/* Input + quick buttons */}
      <div style={card}>
        <input
          ref={inputRef}
          type="text"
          value={expr}
          onChange={e => setExpr(e.target.value)}
          placeholder="e.g. sin(x) + ln(x+1)"
          style={{
            width: "100%", padding: "10px 14px", marginBottom: 10,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.text, fontFamily: "'Space Mono', monospace", fontSize: 13,
            outline: "none",
          }}
          onFocus={e => { e.target.style.borderColor = C.accent; }}
          onBlur={e  => { e.target.style.borderColor = C.border; }}
        />

        {/* Quick-insert */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {QUICK.map(q => (
            <button key={q.label} onClick={() => handleInsert(q.ins)} style={quickBtn}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Preset expressions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: C.muted, marginRight: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            presets
          </span>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => setExpr(p.expr)}
              style={{ ...quickBtn, background: "transparent", color: C.muted,
                border: `1px solid ${C.border}` }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* x slider */}
      {hasX && (
        <div style={{ ...card, padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.muted, minWidth: 14 }}>x</span>
            <input
              type="range"
              min={-6.28} max={6.28} step={0.01}
              value={xVal}
              onChange={e => setXVal(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{
              fontSize: 12, color: C.accent, fontFamily: "'Space Mono', monospace",
              minWidth: 64, textAlign: "right",
            }}>{xVal.toFixed(4)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 9, color: C.muted, marginTop: 3 }}>
            <span>−2π</span><span>0</span><span>+2π</span>
          </div>
        </div>
      )}

      {/* Result */}
      <div style={card}>
        {evalError ? (
          <div style={{ color: C.red, fontSize: 12 }}>⚠ {evalError}</div>
        ) : result ? (
          <>
            {/* Large number */}
            <div style={{ fontSize: 28, fontWeight: 700, color: C.text,
              letterSpacing: "-0.02em", marginBottom: 4, wordBreak: "break-all" }}>
              {fmt(result.value)}
            </div>

            {/* Error vs Math.* */}
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              vs Math.* &nbsp;error = {fmtErr(result.absError)}
            </div>

            {/* Node count + badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>
                  {result.totalNodes}
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>nodes</span>
              </div>

              {mode === "best" && result.emlNodes && savings > 0 && (
                <span style={{
                  fontSize: 10, padding: "3px 9px", borderRadius: 4,
                  background: "rgba(94,196,122,0.10)", border: `1px solid ${C.green}`,
                  color: C.green,
                }}>
                  {savings}% fewer nodes than pure EML
                </span>
              )}

              {mode === "eml" && result.totalNodes > 0 && (
                <span style={{
                  fontSize: 10, padding: "3px 9px", borderRadius: 4,
                  background: "rgba(106,176,245,0.08)", border: `1px solid ${C.blue}`,
                  color: C.blue,
                }}>
                  pure EML baseline
                </span>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: C.muted, fontSize: 12 }}>
            Type an expression above to evaluate
          </div>
        )}
      </div>

      {/* Node breakdown (expandable) */}
      {result && result.nodeLog.length > 0 && (
        <div style={card}>
          <button
            onClick={() => setShowTree(v => !v)}
            style={{ ...btnBase, padding: "4px 10px", fontSize: 10,
              background: "transparent", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 8 }}>{showTree ? "▼" : "▶"}</span>
            Node breakdown &nbsp;
            <span style={{ color: C.muted }}>({result.nodeLog.length} operation{result.nodeLog.length > 1 ? "s" : ""})</span>
          </button>

          {showTree && (
            <div style={{ marginTop: 12 }}>
              {result.nodeLog.map((entry, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "80px 56px 36px 1fr",
                  alignItems: "center", gap: 8,
                  padding: "5px 0",
                  borderBottom: i < result.nodeLog.length - 1
                    ? `1px solid ${C.border}` : "none",
                }}>
                  <span style={{ fontSize: 11, color: C.text, fontFamily: "'Space Mono', monospace" }}>
                    {entry.fn}
                  </span>
                  <OpPill op={entry.op} />
                  <span style={{ fontSize: 11, color: C.accent, textAlign: "right" }}>
                    {entry.nodes}n
                  </span>
                  <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      width: `${(entry.nodes / maxNodes) * 100}%`,
                      height: "100%", borderRadius: 2,
                      background: PILL[entry.op]?.border || C.accent,
                      transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div style={{
                display: "grid", gridTemplateColumns: "80px 56px 36px 1fr",
                alignItems: "center", gap: 8, paddingTop: 8, marginTop: 4,
                borderTop: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                  letterSpacing: "0.06em" }}>Total</span>
                <span />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, textAlign: "right" }}>
                  {result.totalNodes}n
                </span>
                {mode === "best" && result.emlNodes && savings > 0 && (
                  <span style={{ fontSize: 9, color: C.green }}>
                    EML baseline: {result.emlNodes}n
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Supported functions hint */}
      <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.8 }}>
        Functions: sin, cos, exp, ln, pow(x,n), sqrt, abs &nbsp;·&nbsp;
        Operators: + − * / ^ &nbsp;·&nbsp;
        Constants: pi, e &nbsp;·&nbsp;
        Variable: x (use slider)
      </div>
    </div>
  );
}
