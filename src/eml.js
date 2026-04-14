/**
 * monogate — Exp-Minus-Log arithmetic (inlined for the explorer)
 * Full library: https://www.npmjs.com/package/monogate
 * Reference: arXiv:2603.21852 (Odrzywołek, 2026)
 */

export const op = (x, y) => Math.exp(x) - Math.log(y);

export const E    = op(1, 1);
export const ZERO = op(1, op(op(1, 1), 1));
export const NEG_ONE = op(ZERO, op(2, 1));

export const exp = (x) => op(x, 1);
export const ln  = (x) => op(1, op(op(1, x), 1));
export const sub = (x, y) => op(ln(x), exp(y));

export const neg = (y) => {
  if (y <= 0) {
    const a = op(y, 1);
    return op(ln(op(a, a)), op(op(a, 1), 1));
  }
  const y1 = op(ln(y), op(NEG_ONE, 1));
  return op(ZERO, op(y1, 1));
};

export const add = (x, y) => {
  if (x > 0) return op(ln(x), op(neg(y), 1));
  if (y > 0) return op(ln(y), op(neg(x), 1));
  return neg(op(ln(neg(x)), op(neg(neg(y)), 1)));
};

export const mul   = (x, y) => op(add(ln(x), ln(y)), 1);
export const div   = (x, y) => op(add(ln(x), neg(ln(y))), 1);
export const pow   = (x, n) => op(mul(n, ln(x)), 1);
export const recip = (x)    => op(neg(ln(x)), 1);

export const IDENTITIES = [
  { name: "eˣ",  emlForm: "eml(x,1)",                          nodes: 1,  depth: 1, status: "verified" },
  { name: "ln x",emlForm: "eml(1,eml(eml(1,x),1))",            nodes: 3,  depth: 3, status: "verified" },
  { name: "e",   emlForm: "eml(1,1)",                           nodes: 1,  depth: 1, status: "verified" },
  { name: "0",   emlForm: "eml(1,eml(eml(1,1),1))",            nodes: 3,  depth: 3, status: "verified" },
  { name: "x−y", emlForm: "eml(ln(x),exp(y))",                 nodes: 5,  depth: 4, status: "verified" },
  { name: "−y",  emlForm: "two-regime (see source)",            nodes: 9,  depth: 5, status: "proven"   },
  { name: "x+y", emlForm: "eml(ln(x),eml(neg(y),1))",          nodes: 11, depth: 6, status: "proven"   },
  { name: "x×y", emlForm: "eml(add(ln(x),ln(y)),1)",           nodes: 13, depth: 7, status: "proven"   },
  { name: "x/y", emlForm: "eml(add(ln(x),neg(ln(y))),1)",      nodes: 15, depth: 8, status: "proven"   },
  { name: "xⁿ",  emlForm: "eml(mul(n,ln(x)),1)",               nodes: 15, depth: 8, status: "proven"   },
  { name: "1/x", emlForm: "eml(neg(ln(x)),1)",                 nodes: 5,  depth: 4, status: "verified"  },
];
