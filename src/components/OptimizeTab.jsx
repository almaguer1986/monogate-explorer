import { useState } from "react";

const C = {
  bg: "#07080f", surface: "#0d0e1c", border: "#191b2e",
  text: "#cdd0e0", muted: "#4e5168", accent: "#e8a020",
  blue: "#6ab0f5", green: "#5ec47a", red: "#e05060", tag: "#1a1c2e",
};

const PILL = {
  EML: { bg: "rgba(124,111,247,0.14)", border: "#7c6ff7", color: "#a09cf7" },
  EDL: { bg: "rgba(45,212,191,0.10)", border: "#2dd4bf", color: "#2dd4bf" },
  EXL: { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", color: "#f5b435" },
};

// ── Detection rules ────────────────────────────────────────────────────────────
// Each rule: regex to find occurrences, node costs, operator label, substitution
const RULES = [
  {
    id: "log", label: "log / ln",
    re: /(?:math|torch|np|numpy|F)\.log(?:_?\d+)?\s*\(/g,
    eml: 3, best: 1, op: "EXL",
    note: "EXL ln in 1 node vs EML's 3",
    sub: s => s.replace(/(?:math|torch|np|numpy|F)\.log(?:_?\d+)?/, "ln_exl"),
  },
  {
    id: "exp", label: "exp",
    re: /(?:math|torch|np|numpy|F)\.exp\s*\(/g,
    eml: 1, best: 1, op: "EML",
    note: "same cost in all operators",
    sub: s => s, // no savings, no change
  },
  {
    id: "sin", label: "sin",
    re: /(?:math|torch|np|numpy|F)\.sin\s*\(/g,
    eml: 245, best: 63, op: "EXL",
    note: "BEST: 8-term Taylor via EXL pow (63 nodes)",
    sub: s => s.replace(/(?:math|torch|np|numpy|F)\.sin/, "sin_best"),
  },
  {
    id: "cos", label: "cos",
    re: /(?:math|torch|np|numpy|F)\.cos\s*\(/g,
    eml: 245, best: 63, op: "EXL",
    note: "BEST: 8-term Taylor via EXL pow (63 nodes)",
    sub: s => s.replace(/(?:math|torch|np|numpy|F)\.cos/, "cos_best"),
  },
  {
    id: "pow_fn", label: "pow(x,n)",
    re: /(?:math|torch|np|numpy)\.pow(?:er)?\s*\(/g,
    eml: 15, best: 3, op: "EXL",
    note: "EXL pow in 3 nodes vs EML's 15",
    sub: s => s.replace(/(?:math|torch|np|numpy)\.pow(?:er)?/, "pow_exl"),
  },
  {
    id: "pow_op", label: "x ** n",
    re: /\*\*\s*\d+/g,
    eml: 15, best: 3, op: "EXL",
    note: "EXL pow in 3 nodes vs EML's 15",
    sub: s => s, // leave syntax intact, note in comment
  },
  {
    id: "sqrt", label: "sqrt",
    re: /(?:math|torch|np|numpy)\.sqrt\s*\(/g,
    eml: 15, best: 3, op: "EXL",
    note: "EXL: pow(x, 0.5) in 3 nodes",
    sub: s => s.replace(/(?:math|torch|np|numpy)\.sqrt/, "sqrt_exl"),
  },
  {
    id: "div_fn", label: "torch.div / np.divide",
    re: /(?:torch\.div|np\.divide)\s*\(/g,
    eml: 15, best: 1, op: "EDL",
    note: "EDL div in 1 node vs EML's 15",
    sub: s => s.replace(/(?:torch\.div|np\.divide)/, "div_edl"),
  },
  {
    id: "mul_fn", label: "torch.mul / np.multiply",
    re: /(?:torch\.mul|np\.multiply)\s*\(/g,
    eml: 13, best: 7, op: "EDL",
    note: "EDL mul in 7 nodes vs EML's 13",
    sub: s => s.replace(/(?:torch\.mul|np\.multiply)/, "mul_edl"),
  },
];

const EXAMPLES = [
  {
    label: "Taylor term",
    code: `import math

def taylor_sin_term(x, k):
    # k-th term of sin Taylor series
    return math.exp(x) / math.factorial(2*k+1)`,
  },
  {
    label: "PyTorch activation",
    code: `import torch

def eml_activation(x, z):
    return torch.exp(x) * torch.log(z + 1.0)`,
  },
  {
    label: "NumPy array ops",
    code: `import numpy as np

y = np.sin(x) + np.cos(x) / np.power(x, 2)`,
  },
  {
    label: "Power series",
    code: `import math

def poly(x):
    return x**3 + 2 * x**2 + math.exp(x) / math.log(x + 1)`,
  },
];

// ── Core analysis ──────────────────────────────────────────────────────────────
function analyzeCode(src) {
  if (!src.trim()) return null;

  const matches = [];
  let totalEml = 0;
  let totalBest = 0;

  for (const rule of RULES) {
    rule.re.lastIndex = 0; // reset global regex
    const found = src.match(rule.re);
    const count = found ? found.length : 0;
    if (count > 0) {
      matches.push({ ...rule, count });
      totalEml  += count * rule.eml;
      totalBest += count * rule.best;
    }
  }

  if (matches.length === 0) return { matches: [], totalEml: 0, totalBest: 0, rewritten: src };

  // Apply substitutions
  let rewritten = src;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    rewritten = rewritten.replace(rule.re, m => rule.sub(m));
  }

  // Prepend import block if anything changed
  const needsImport = matches.some(m => m.id !== "exp" && m.id !== "pow_op");
  if (needsImport && rewritten !== src) {
    rewritten =
      "from monogate import BEST\n" +
      "from monogate.torch_ops import ln_exl, pow_exl, sin_best, cos_best, div_edl, mul_edl\n\n" +
      rewritten;
  }

  return { matches, totalEml, totalBest, rewritten };
}

// ── Components ─────────────────────────────────────────────────────────────────
function OpPill({ op }) {
  const s = PILL[op] || PILL.EML;
  return (
    <span style={{
      fontSize: 9, padding: "1px 6px", borderRadius: 3,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0,
    }}>{op}</span>
  );
}

export default function OptimizeTab() {
  const [src,     setSrc]     = useState("");
  const [result,  setResult]  = useState(null);
  const [copied,  setCopied]  = useState(false);

  const analyze = () => setResult(analyzeCode(src));

  const savings = result && result.totalEml > 0
    ? Math.round((1 - result.totalBest / result.totalEml) * 100)
    : 0;

  const card = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: 16, marginBottom: 12,
  };

  const btnBase = {
    padding: "5px 12px", fontSize: 10, borderRadius: 4,
    border: `1px solid ${C.border}`, background: "transparent",
    color: C.muted, cursor: "pointer",
    fontFamily: "'Space Mono', monospace", letterSpacing: "0.04em",
  };

  return (
    <div style={{ overflowX: "hidden" }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
          ⚙ Optimize My Code
        </div>
        <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7 }}>
          Paste a Python / NumPy / PyTorch snippet. We detect each math operation,
          map it to the optimal BEST operator, and estimate the node savings.
          Supports: <code style={{ color: C.text }}>math.*</code>,{" "}
          <code style={{ color: C.text }}>np.*</code>,{" "}
          <code style={{ color: C.text }}>torch.*</code>
        </div>
      </div>

      {/* Example buttons */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: C.muted, alignSelf: "center",
          textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>
          examples
        </span>
        {EXAMPLES.map(ex => (
          <button key={ex.label}
            onClick={() => { setSrc(ex.code); setResult(analyzeCode(ex.code)); }}
            style={{ ...btnBase, padding: "4px 10px", background: C.tag }}>
            {ex.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={card}>
        <textarea
          value={src}
          onChange={e => setSrc(e.target.value)}
          placeholder={"Paste Python / NumPy / PyTorch code here…\n\nExample:\n  y = math.exp(x) / math.log(z + 1)"}
          rows={8}
          style={{
            width: "100%", padding: "10px 14px",
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.text, fontFamily: "'Space Mono', monospace", fontSize: 11,
            outline: "none", resize: "vertical", lineHeight: 1.6,
          }}
          onFocus={e  => { e.target.style.borderColor = C.accent; }}
          onBlur={e   => { e.target.style.borderColor = C.border; }}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) analyze(); }}
        />
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginTop: 10, flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontSize: 9, color: C.muted }}>⌘↵ to analyze</span>
          <button onClick={analyze} style={{
            ...btnBase, padding: "7px 18px", fontSize: 11,
            color: C.accent, border: `1px solid ${C.accent}`,
            background: "rgba(232,160,32,0.08)", fontWeight: 700,
          }}>
            Analyze →
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {result.matches.length === 0 ? (
            <div style={{ ...card, color: C.muted, fontSize: 11 }}>
              No recognized math operations found.
              Supported: math.exp, math.log, math.sin, math.cos, torch.exp, np.power, etc.
            </div>
          ) : (
            <>
              {/* Operation breakdown */}
              <div style={card}>
                <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                  letterSpacing: "0.06em", marginBottom: 10 }}>
                  Detected operations
                </div>
                {result.matches.map(m => (
                  <div key={m.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 48px 80px 80px",
                    alignItems: "center", gap: 8, padding: "6px 0",
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div>
                      <span style={{ fontSize: 11, color: C.text }}>{m.label}</span>
                      {m.count > 1 && (
                        <span style={{ fontSize: 9, color: C.muted, marginLeft: 6 }}>×{m.count}</span>
                      )}
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{m.note}</div>
                    </div>
                    <OpPill op={m.op} />
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 11, color: C.accent }}>{m.count * m.best}n</span>
                      <span style={{ fontSize: 9, color: C.muted }}> BEST</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 11, color: C.muted, textDecoration: "line-through" }}>
                        {m.count * m.eml}n
                      </span>
                      <span style={{ fontSize: 9, color: C.muted }}> EML</span>
                    </div>
                  </div>
                ))}

                {/* Totals */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 80px 80px",
                  alignItems: "center", gap: 8, paddingTop: 10, marginTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                      letterSpacing: "0.06em" }}>Total</span>
                    {savings > 0 && (
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                        background: "rgba(94,196,122,0.10)", border: `1px solid ${C.green}`,
                        color: C.green,
                      }}>
                        ✦ {savings}% savings
                      </span>
                    )}
                  </div>
                  <span />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, textAlign: "right" }}>
                    {result.totalBest}n
                  </span>
                  <span style={{ fontSize: 13, color: C.muted, textAlign: "right",
                    textDecoration: "line-through" }}>
                    {result.totalEml}n
                  </span>
                </div>
              </div>

              {/* Rewritten code */}
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.06em" }}>
                    Rewritten (monogate)
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.rewritten).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }}
                    style={{ ...btnBase, padding: "3px 9px", fontSize: 9,
                      color: copied ? C.green : C.muted,
                      borderColor: copied ? C.green : C.border,
                      background: copied ? "rgba(94,196,122,0.08)" : "transparent",
                    }}>
                    {copied ? "✓ copied" : "⎘ copy"}
                  </button>
                </div>
                <pre style={{
                  margin: 0, padding: "12px 14px", overflowX: "auto",
                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                  fontSize: 11, color: C.text, lineHeight: 1.7,
                  fontFamily: "'Space Mono', monospace",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {result.rewritten}
                </pre>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
                  Note: this is a structural substitution — verify function signatures match your usage.
                  x ** n patterns retain Python syntax; use pow_exl(x, n) for full BEST routing.
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && (
        <div style={{ ...card, color: C.muted, fontSize: 11, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 8, color: C.text, fontSize: 10 }}>What this tool does:</div>
          <div>① Scans your code for <code>math.*</code> / <code>np.*</code> / <code>torch.*</code> operations</div>
          <div>② Maps each to the BEST operator (EML / EDL / EXL) with fewest nodes</div>
          <div>③ Estimates total node count reduction</div>
          <div>④ Outputs a rewritten snippet using the monogate Python package</div>
        </div>
      )}
    </div>
  );
}
