import { j0 as zr, ig as gr, j1 as je, a5 as Lr, iA as It, iX as tu, iY as mr, iZ as eu, i_ as ru, iW as nu, iv as uu, eX as iu, i$ as Er } from "./decoder.js";
import { createCanvas as ou } from "./canvas-mock.js";
class Fr {
  constructor(e, r, u) {
    this.cumsum = [];
    for (let n = 0; n < u; n++) {
      this.cumsum.push([]);
      for (let i = 0; i < r; i++)
        this.cumsum[n].push(0);
    }
    this.cumsum[0][0] = e[0];
    for (let n = 1; n < r; n++)
      this.cumsum[0][n] = this.cumsum[0][n - 1] + e[n];
    for (let n = 1; n < u; n++)
      this.cumsum[n][0] = this.cumsum[n - 1][0] + e[n * r];
    for (let n = 1; n < u; n++)
      for (let i = 1; i < r; i++)
        this.cumsum[n][i] = e[n * r + i] + this.cumsum[n - 1][i] + this.cumsum[n][i - 1] - this.cumsum[n - 1][i - 1];
  }
  query(e, r, u, n) {
    let i = this.cumsum[n][u];
    return r > 0 && (i -= this.cumsum[r - 1][u]), e > 0 && (i -= this.cumsum[n][e - 1]), e > 0 && r > 0 && (i += this.cumsum[r - 1][e - 1]), i;
  }
}
const De = 10, Re = 2, rt = 6, su = 5, Ar = 0.95, au = 0.9, fu = 0.2, cu = 8, hu = 24 * 2 / 3, lu = (t) => {
  const { data: e, width: r, height: u, scale: n } = t, i = [r * u];
  for (let d = 0; d < i.length; d++)
    i[d] = !1;
  const s = new Float32Array(e.length);
  for (let d = 0; d < r; d++)
    s[d] = -1, s[r * (u - 1) + d] = -1;
  for (let d = 0; d < u; d++)
    s[d * r] = -1, s[d * r + r - 1] = -1;
  for (let d = 1; d < r - 1; d++)
    for (let F = 1; F < u - 1; F++) {
      let E = d + r * F, w = 0, N = 0;
      for (let B = -1; B <= 1; B++)
        w += e[E + r * B + 1] - e[E + r * B - 1], N += e[E + r + B] - e[E - r + B];
      w /= 3 * 256, N /= 3 * 256, s[E] = Math.sqrt((w * w + N * N) / 2);
    }
  const h = new Uint32Array(1e3);
  for (let d = 0; d < 1e3; d++)
    h[d] = 0;
  const D = [-1, 1, -r, r];
  for (let d = 1; d < r - 1; d++)
    for (let F = 1; F < u - 1; F++) {
      let E = d + r * F, w = !0;
      for (let N = 0; N < D.length; N++)
        if (s[E] <= s[E + D[N]]) {
          w = !1;
          break;
        }
      if (w) {
        let N = Math.floor(s[E] * 1e3);
        N > 999 && (N = 999), N < 0 && (N = 0), h[N] += 1, i[E] = !0;
      }
    }
  const p = 0.02 * r * u;
  let a = 999, o = 0;
  for (; a >= 0 && (o += h[a], !(o > p)); )
    a--;
  for (let d = 0; d < i.length; d++)
    i[d] && s[d] * 1e3 < a && (i[d] = !1);
  const f = [];
  for (let d = 0; d < e.length; d++)
    f[d] = e[d] * e[d];
  const l = new Fr(e, r, u), g = new Fr(f, r, u), c = new Float32Array(e.length);
  for (let d = 0; d < r; d++)
    for (let F = 0; F < u; F++) {
      const E = F * r + d;
      if (!i[E]) {
        c[E] = 1;
        continue;
      }
      const w = qr({ image: t, cx: d, cy: F, sdThresh: su, imageDataCumsum: l, imageDataSqrCumsum: g });
      if (w === null) {
        c[E] = 1;
        continue;
      }
      let N = -1;
      for (let B = -De; B <= De; B++) {
        for (let M = -De; M <= De; M++) {
          if (M * M + B * B <= Re * Re)
            continue;
          const C = Ur({ image: t, cx: d + M, cy: F + B, vlen: w, tx: d, ty: F, imageDataCumsum: l, imageDataSqrCumsum: g });
          if (C !== null && C > N && (N = C, N > Ar))
            break;
        }
        if (N > Ar)
          break;
      }
      c[E] = N;
    }
  return Du({ image: t, featureMap: c, templateSize: rt, searchSize: Re, occSize: hu, maxSimThresh: au, minSimThresh: fu, sdThresh: cu, imageDataCumsum: l, imageDataSqrCumsum: g });
}, Du = (t) => {
  let { image: e, featureMap: r, templateSize: u, searchSize: n, occSize: i, maxSimThresh: s, minSimThresh: h, sdThresh: D, imageDataCumsum: p, imageDataSqrCumsum: a } = t;
  const { data: o, width: f, height: l, scale: g } = e;
  i = Math.floor(Math.min(e.width, e.height) / 10);
  const c = (u * 2 + 1) * 3, v = Math.floor(f / c), d = Math.floor(l / c);
  let F = Math.floor(f / i) * Math.floor(l / i) + v * d;
  const E = [], w = new Float32Array(o.length);
  for (let B = 0; B < w.length; B++)
    w[B] = r[B];
  let N = 0;
  for (; N < F; ) {
    let B = s, M = -1, C = -1;
    for (let L = 0; L < l; L++)
      for (let U = 0; U < f; U++)
        w[L * f + U] < B && (B = w[L * f + U], M = U, C = L);
    if (M === -1)
      break;
    const _ = qr({ image: e, cx: M, cy: C, sdThresh: 0, imageDataCumsum: p, imageDataSqrCumsum: a });
    if (_ === null) {
      w[C * f + M] = 1;
      continue;
    }
    if (_ / (u * 2 + 1) < D) {
      w[C * f + M] = 1;
      continue;
    }
    let z = 1, k = -1;
    for (let L = -n; L <= n; L++) {
      for (let U = -n; U <= n; U++) {
        if (U * U + L * L > n * n || U === 0 && L === 0)
          continue;
        const W = Ur({ image: e, vlen: _, cx: M + U, cy: C + L, tx: M, ty: C, imageDataCumsum: p, imageDataSqrCumsum: a });
        if (W !== null && (W < z && (z = W, z < h && z < B) || W > k && (k = W, k > 0.99)))
          break;
      }
      if (z < h && z < B || k > 0.99)
        break;
    }
    if (z < h && z < B || k > 0.99) {
      w[C * f + M] = 1;
      continue;
    }
    E.push({ x: M, y: C }), N += 1;
    for (let L = -i; L <= i; L++)
      for (let U = -i; U <= i; U++)
        C + L < 0 || C + L >= l || M + U < 0 || M + U >= f || (w[(C + L) * f + (M + U)] = 1);
  }
  return E;
}, qr = ({ image: t, cx: e, cy: r, sdThresh: u, imageDataCumsum: n, imageDataSqrCumsum: i }) => {
  if (e - rt < 0 || e + rt >= t.width || r - rt < 0 || r + rt >= t.height)
    return null;
  const s = 2 * rt + 1, h = s * s;
  let D = n.query(e - rt, r - rt, e + rt, r + rt);
  D /= h;
  let p = i.query(e - rt, r - rt, e + rt, r + rt);
  return p -= 2 * D * n.query(e - rt, r - rt, e + rt, r + rt), p += h * D * D, p / h < u * u ? null : (p = Math.sqrt(p), p);
}, Ur = (t) => {
  const { image: e, cx: r, cy: u, vlen: n, tx: i, ty: s, imageDataCumsum: h, imageDataSqrCumsum: D } = t, { data: p, width: a, height: o } = e, f = rt;
  if (r - f < 0 || r + f >= a || u - f < 0 || u + f >= o)
    return null;
  const l = 2 * f + 1;
  let g = h.query(r - f, u - f, r + f, u + f), c = D.query(r - f, u - f, r + f, u + f), v = 0, d = (u - f) * a + (r - f), F = (s - f) * a + (i - f), E = a - l;
  for (let M = 0; M < l; M++) {
    for (let C = 0; C < l; C++)
      v += p[d] * p[F], d += 1, F += 1;
    d += E, F += E;
  }
  let w = h.query(i - f, s - f, i + f, s + f);
  w /= l * l, v -= w * g;
  let N = c - g * g / (l * l);
  return N == 0 ? null : (N = Math.sqrt(N), 1 * v / (n * N));
}, pu = (t, e) => {
  const r = [];
  for (let u = 0; u < t.length; u++) {
    const n = t[u], i = lu(n), s = {
      data: n.data,
      scale: n.scale,
      width: n.width,
      height: n.height,
      points: i
    };
    r.push(s), e(u);
  }
  return r;
};
function He() {
  return He = Object.assign ? Object.assign.bind() : function(t) {
    for (var e = 1; e < arguments.length; e++) {
      var r = arguments[e];
      for (var u in r)
        Object.prototype.hasOwnProperty.call(r, u) && (t[u] = r[u]);
    }
    return t;
  }, He.apply(this, arguments);
}
var $r = {
  // minimum relative difference between two compared values,
  // used by all comparison functions
  epsilon: 1e-12,
  // type of default matrix output. Choose 'matrix' (default) or 'array'
  matrix: "Matrix",
  // type of default number output. Choose 'number' (default) 'BigNumber', or 'Fraction
  number: "number",
  // number of significant digits in BigNumbers
  precision: 64,
  // predictable output type of functions. When true, output type depends only
  // on the input types. When false (default), output type can vary depending
  // on input values. For example `math.sqrt(-4)` returns `complex('2i')` when
  // predictable is false, and returns `NaN` when true.
  predictable: !1,
  // random seed for seeded pseudo random number generation
  // null = randomly seed
  randomSeed: null
};
function tt(t) {
  return typeof t == "number";
}
function _t(t) {
  return !t || typeof t != "object" || typeof t.constructor != "function" ? !1 : t.isBigNumber === !0 && typeof t.constructor.prototype == "object" && t.constructor.prototype.isBigNumber === !0 || typeof t.constructor.isDecimal == "function" && t.constructor.isDecimal(t) === !0;
}
function jr(t) {
  return t && typeof t == "object" && Object.getPrototypeOf(t).isComplex === !0 || !1;
}
function Hr(t) {
  return t && typeof t == "object" && Object.getPrototypeOf(t).isFraction === !0 || !1;
}
function Zr(t) {
  return t && t.constructor.prototype.isUnit === !0 || !1;
}
function Tt(t) {
  return typeof t == "string";
}
var J = Array.isArray;
function Lt(t) {
  return t && t.constructor.prototype.isMatrix === !0 || !1;
}
function me(t) {
  return Array.isArray(t) || Lt(t);
}
function du(t) {
  return t && t.isDenseMatrix && t.constructor.prototype.isMatrix === !0 || !1;
}
function vu(t) {
  return t && t.isSparseMatrix && t.constructor.prototype.isMatrix === !0 || !1;
}
function gu(t) {
  return t && t.constructor.prototype.isRange === !0 || !1;
}
function tr(t) {
  return t && t.constructor.prototype.isIndex === !0 || !1;
}
function mu(t) {
  return typeof t == "boolean";
}
function Eu(t) {
  return t && t.constructor.prototype.isResultSet === !0 || !1;
}
function Fu(t) {
  return t && t.constructor.prototype.isHelp === !0 || !1;
}
function Au(t) {
  return typeof t == "function";
}
function wu(t) {
  return t instanceof Date;
}
function Cu(t) {
  return t instanceof RegExp;
}
function yu(t) {
  return !!(t && typeof t == "object" && t.constructor === Object && !jr(t) && !Hr(t));
}
function Bu(t) {
  return t === null;
}
function Nu(t) {
  return t === void 0;
}
function _u(t) {
  return t && t.isAccessorNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Mu(t) {
  return t && t.isArrayNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function bu(t) {
  return t && t.isAssignmentNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Su(t) {
  return t && t.isBlockNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Iu(t) {
  return t && t.isConditionalNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Tu(t) {
  return t && t.isConstantNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Ou(t) {
  return t && t.isFunctionAssignmentNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Pu(t) {
  return t && t.isFunctionNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function xu(t) {
  return t && t.isIndexNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function ku(t) {
  return t && t.isNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Ru(t) {
  return t && t.isObjectNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function zu(t) {
  return t && t.isOperatorNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Lu(t) {
  return t && t.isParenthesisNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function qu(t) {
  return t && t.isRangeNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function Uu(t) {
  return t && t.isRelationalNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function $u(t) {
  return t && t.isSymbolNode === !0 && t.constructor.prototype.isNode === !0 || !1;
}
function ju(t) {
  return t && t.constructor.prototype.isChain === !0 || !1;
}
function se(t) {
  var e = typeof t;
  return e === "object" ? t === null ? "null" : _t(t) ? "BigNumber" : t.constructor && t.constructor.name ? t.constructor.name : "Object" : e;
}
function lt(t) {
  var e = typeof t;
  if (e === "number" || e === "string" || e === "boolean" || t === null || t === void 0)
    return t;
  if (typeof t.clone == "function")
    return t.clone();
  if (Array.isArray(t))
    return t.map(function(r) {
      return lt(r);
    });
  if (t instanceof Date)
    return new Date(t.valueOf());
  if (_t(t))
    return t;
  if (t instanceof RegExp)
    throw new TypeError("Cannot clone " + t);
  return Hu(t, lt);
}
function Hu(t, e) {
  var r = {};
  for (var u in t)
    Fe(t, u) && (r[u] = e(t[u]));
  return r;
}
function Ee(t, e) {
  var r, u, n;
  if (Array.isArray(t)) {
    if (!Array.isArray(e) || t.length !== e.length)
      return !1;
    for (u = 0, n = t.length; u < n; u++)
      if (!Ee(t[u], e[u]))
        return !1;
    return !0;
  } else {
    if (typeof t == "function")
      return t === e;
    if (t instanceof Object) {
      if (Array.isArray(e) || !(e instanceof Object))
        return !1;
      for (r in t)
        if (!(r in e) || !Ee(t[r], e[r]))
          return !1;
      for (r in e)
        if (!(r in t))
          return !1;
      return !0;
    } else
      return t === e;
  }
}
function Fe(t, e) {
  return t && Object.hasOwnProperty.call(t, e);
}
function Zu(t, e) {
  for (var r = {}, u = 0; u < e.length; u++) {
    var n = e[u], i = t[n];
    i !== void 0 && (r[n] = i);
  }
  return r;
}
var Vu = ["Matrix", "Array"], Wu = ["number", "BigNumber", "Fraction"], Me = function(e) {
  if (e)
    throw new Error(`The global config is readonly. 
Please create a mathjs instance if you want to change the default configuration. 
Example:

  import { create, all } from 'mathjs';
  const mathjs = create(all);
  mathjs.config({ number: 'BigNumber' });
`);
  return Object.freeze($r);
};
He(Me, $r, {
  MATRIX_OPTIONS: Vu,
  NUMBER_OPTIONS: Wu
});
function Mt(t, e) {
  var r = typeof Symbol < "u" && t[Symbol.iterator] || t["@@iterator"];
  if (!r) {
    if (Array.isArray(t) || (r = Yu(t)) || e && t && typeof t.length == "number") {
      r && (t = r);
      var u = 0, n = function() {
      };
      return { s: n, n: function() {
        return u >= t.length ? { done: !0 } : { done: !1, value: t[u++] };
      }, e: function(p) {
        throw p;
      }, f: n };
    }
    throw new TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
  }
  var i = !0, s = !1, h;
  return { s: function() {
    r = r.call(t);
  }, n: function() {
    var p = r.next();
    return i = p.done, p;
  }, e: function(p) {
    s = !0, h = p;
  }, f: function() {
    try {
      !i && r.return != null && r.return();
    } finally {
      if (s)
        throw h;
    }
  } };
}
function Yu(t, e) {
  if (t) {
    if (typeof t == "string")
      return wr(t, e);
    var r = Object.prototype.toString.call(t).slice(8, -1);
    if (r === "Object" && t.constructor && (r = t.constructor.name), r === "Map" || r === "Set")
      return Array.from(t);
    if (r === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r))
      return wr(t, e);
  }
}
function wr(t, e) {
  (e == null || e > t.length) && (e = t.length);
  for (var r = 0, u = new Array(e); r < e; r++)
    u[r] = t[r];
  return u;
}
function Gt(t) {
  "@babel/helpers - typeof";
  return Gt = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, Gt(t);
}
function Cr() {
  return !0;
}
function Nt() {
  return !1;
}
function Yt() {
}
var yr = "Argument is not a typed-function.";
function Vr() {
  function t(m) {
    return Gt(m) === "object" && m !== null && m.constructor === Object;
  }
  var e = [{
    name: "number",
    test: function(A) {
      return typeof A == "number";
    }
  }, {
    name: "string",
    test: function(A) {
      return typeof A == "string";
    }
  }, {
    name: "boolean",
    test: function(A) {
      return typeof A == "boolean";
    }
  }, {
    name: "Function",
    test: function(A) {
      return typeof A == "function";
    }
  }, {
    name: "Array",
    test: Array.isArray
  }, {
    name: "Date",
    test: function(A) {
      return A instanceof Date;
    }
  }, {
    name: "RegExp",
    test: function(A) {
      return A instanceof RegExp;
    }
  }, {
    name: "Object",
    test: t
  }, {
    name: "null",
    test: function(A) {
      return A === null;
    }
  }, {
    name: "undefined",
    test: function(A) {
      return A === void 0;
    }
  }], r = {
    name: "any",
    test: Cr,
    isAny: !0
  }, u, n, i = 0, s = {
    createCount: 0
  };
  function h(m) {
    var A = u.get(m);
    if (A)
      return A;
    var y = 'Unknown type "' + m + '"', b = m.toLowerCase(), T, O = Mt(n), x;
    try {
      for (O.s(); !(x = O.n()).done; )
        if (T = x.value, T.toLowerCase() === b) {
          y += '. Did you mean "' + T + '" ?';
          break;
        }
    } catch (I) {
      O.e(I);
    } finally {
      O.f();
    }
    throw new TypeError(y);
  }
  function D(m) {
    for (var A = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : "any", y = A ? h(A).index : n.length, b = [], T = 0; T < m.length; ++T) {
      if (!m[T] || typeof m[T].name != "string" || typeof m[T].test != "function")
        throw new TypeError("Object with properties {name: string, test: function} expected");
      var O = m[T].name;
      if (u.has(O))
        throw new TypeError('Duplicate type name "' + O + '"');
      b.push(O), u.set(O, {
        name: O,
        test: m[T].test,
        isAny: m[T].isAny,
        index: y + T,
        conversionsTo: []
        // Newly added type can't have any conversions to it
      });
    }
    var x = n.slice(y);
    n = n.slice(0, y).concat(b).concat(x);
    for (var I = y + b.length; I < n.length; ++I)
      u.get(n[I]).index = I;
  }
  function p() {
    u = /* @__PURE__ */ new Map(), n = [], i = 0, D([r], !1);
  }
  p(), D(e);
  function a() {
    var m, A = Mt(n), y;
    try {
      for (A.s(); !(y = A.n()).done; )
        m = y.value, u.get(m).conversionsTo = [];
    } catch (b) {
      A.e(b);
    } finally {
      A.f();
    }
    i = 0;
  }
  function o(m) {
    var A = n.filter(function(y) {
      var b = u.get(y);
      return !b.isAny && b.test(m);
    });
    return A.length ? A : ["any"];
  }
  function f(m) {
    return m && typeof m == "function" && "_typedFunctionData" in m;
  }
  function l(m, A, y) {
    if (!f(m))
      throw new TypeError(yr);
    var b = y && y.exact, T = Array.isArray(A) ? A.join(",") : A, O = w(T), x = v(O);
    if (!b || x in m.signatures) {
      var I = m._typedFunctionData.signatureMap.get(x);
      if (I)
        return I;
    }
    var P = O.length, $;
    if (b) {
      $ = [];
      var V;
      for (V in m.signatures)
        $.push(m._typedFunctionData.signatureMap.get(V));
    } else
      $ = m._typedFunctionData.signatures;
    for (var R = 0; R < P; ++R) {
      var dt = O[R], st = [], ht = void 0, et = Mt($), mt;
      try {
        for (et.s(); !(mt = et.n()).done; ) {
          ht = mt.value;
          var ut = C(ht.params, R);
          if (!(!ut || dt.restParam && !ut.restParam)) {
            if (!ut.hasAny) {
              var Bt = function() {
                var Et = E(ut);
                if (dt.types.some(function(jt) {
                  return !Et.has(jt.name);
                }))
                  return "continue";
              }();
              if (Bt === "continue")
                continue;
            }
            st.push(ht);
          }
        }
      } catch (Et) {
        et.e(Et);
      } finally {
        et.f();
      }
      if ($ = st, $.length === 0)
        break;
    }
    var vt, gt = Mt($), $t;
    try {
      for (gt.s(); !($t = gt.n()).done; )
        if (vt = $t.value, vt.params.length <= P)
          return vt;
    } catch (Et) {
      gt.e(Et);
    } finally {
      gt.f();
    }
    throw new TypeError("Signature not found (signature: " + (m.name || "unnamed") + "(" + v(O, ", ") + "))");
  }
  function g(m, A, y) {
    return l(m, A, y).implementation;
  }
  function c(m, A) {
    var y = h(A);
    if (y.test(m))
      return m;
    var b = y.conversionsTo;
    if (b.length === 0)
      throw new Error("There are no conversions to " + A + " defined.");
    for (var T = 0; T < b.length; T++) {
      var O = h(b[T].from);
      if (O.test(m))
        return b[T].convert(m);
    }
    throw new Error("Cannot convert " + m + " to " + A);
  }
  function v(m) {
    var A = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : ",";
    return m.map(function(y) {
      return y.name;
    }).join(A);
  }
  function d(m) {
    var A = m.indexOf("...") === 0, y = A ? m.length > 3 ? m.slice(3) : "any" : m, b = y.split("|").map(function(I) {
      return h(I.trim());
    }), T = !1, O = A ? "..." : "", x = b.map(function(I) {
      return T = I.isAny || T, O += I.name + "|", {
        name: I.name,
        typeIndex: I.index,
        test: I.test,
        isAny: I.isAny,
        conversion: null,
        conversionIndex: -1
      };
    });
    return {
      types: x,
      name: O.slice(0, -1),
      // remove trailing '|' from above
      hasAny: T,
      hasConversion: !1,
      restParam: A
    };
  }
  function F(m) {
    var A = m.types.map(function(x) {
      return x.name;
    }), y = ot(A), b = m.hasAny, T = m.name, O = y.map(function(x) {
      var I = h(x.from);
      return b = I.isAny || b, T += "|" + x.from, {
        name: x.from,
        typeIndex: I.index,
        test: I.test,
        isAny: I.isAny,
        conversion: x,
        conversionIndex: x.index
      };
    });
    return {
      types: m.types.concat(O),
      name: T,
      hasAny: b,
      hasConversion: O.length > 0,
      restParam: m.restParam
    };
  }
  function E(m) {
    return m.typeSet || (m.typeSet = /* @__PURE__ */ new Set(), m.types.forEach(function(A) {
      return m.typeSet.add(A.name);
    })), m.typeSet;
  }
  function w(m) {
    var A = [];
    if (typeof m != "string")
      throw new TypeError("Signatures must be strings");
    var y = m.trim();
    if (y === "")
      return A;
    for (var b = y.split(","), T = 0; T < b.length; ++T) {
      var O = d(b[T].trim());
      if (O.restParam && T !== b.length - 1)
        throw new SyntaxError('Unexpected rest parameter "' + b[T] + '": only allowed for the last parameter');
      if (O.types.length === 0)
        return null;
      A.push(O);
    }
    return A;
  }
  function N(m) {
    var A = Vt(m);
    return A ? A.restParam : !1;
  }
  function B(m) {
    if (!m || m.types.length === 0)
      return Cr;
    if (m.types.length === 1)
      return h(m.types[0].name).test;
    if (m.types.length === 2) {
      var A = h(m.types[0].name).test, y = h(m.types[1].name).test;
      return function(O) {
        return A(O) || y(O);
      };
    } else {
      var b = m.types.map(function(T) {
        return h(T.name).test;
      });
      return function(O) {
        for (var x = 0; x < b.length; x++)
          if (b[x](O))
            return !0;
        return !1;
      };
    }
  }
  function M(m) {
    var A, y, b;
    if (N(m)) {
      A = sr(m).map(B);
      var T = A.length, O = B(Vt(m)), x = function(P) {
        for (var $ = T; $ < P.length; $++)
          if (!O(P[$]))
            return !1;
        return !0;
      };
      return function(P) {
        for (var $ = 0; $ < A.length; $++)
          if (!A[$](P[$]))
            return !1;
        return x(P) && P.length >= T + 1;
      };
    } else
      return m.length === 0 ? function(P) {
        return P.length === 0;
      } : m.length === 1 ? (y = B(m[0]), function(P) {
        return y(P[0]) && P.length === 1;
      }) : m.length === 2 ? (y = B(m[0]), b = B(m[1]), function(P) {
        return y(P[0]) && b(P[1]) && P.length === 2;
      }) : (A = m.map(B), function(P) {
        for (var $ = 0; $ < A.length; $++)
          if (!A[$](P[$]))
            return !1;
        return P.length === A.length;
      });
  }
  function C(m, A) {
    return A < m.length ? m[A] : N(m) ? Vt(m) : null;
  }
  function _(m, A) {
    var y = C(m, A);
    return y ? E(y) : /* @__PURE__ */ new Set();
  }
  function z(m) {
    return m.conversion === null || m.conversion === void 0;
  }
  function k(m, A) {
    var y = /* @__PURE__ */ new Set();
    return m.forEach(function(b) {
      var T = _(b.params, A), O, x = Mt(T), I;
      try {
        for (x.s(); !(I = x.n()).done; )
          O = I.value, y.add(O);
      } catch (P) {
        x.e(P);
      } finally {
        x.f();
      }
    }), y.has("any") ? ["any"] : Array.from(y);
  }
  function L(m, A, y) {
    var b, T, O = m || "unnamed", x = y, I, P = function() {
      var et = [];
      if (x.forEach(function(ut) {
        var Bt = C(ut.params, I), vt = B(Bt);
        (I < ut.params.length || N(ut.params)) && vt(A[I]) && et.push(ut);
      }), et.length === 0) {
        if (T = k(x, I), T.length > 0) {
          var mt = o(A[I]);
          return b = new TypeError("Unexpected type of argument in function " + O + " (expected: " + T.join(" or ") + ", actual: " + mt.join(" | ") + ", index: " + I + ")"), b.data = {
            category: "wrongType",
            fn: O,
            index: I,
            actual: mt,
            expected: T
          }, {
            v: b
          };
        }
      } else
        x = et;
    };
    for (I = 0; I < A.length; I++) {
      var $ = P();
      if (Gt($) === "object")
        return $.v;
    }
    var V = x.map(function(ht) {
      return N(ht.params) ? 1 / 0 : ht.params.length;
    });
    if (A.length < Math.min.apply(null, V))
      return T = k(x, I), b = new TypeError("Too few arguments in function " + O + " (expected: " + T.join(" or ") + ", index: " + A.length + ")"), b.data = {
        category: "tooFewArgs",
        fn: O,
        index: A.length,
        expected: T
      }, b;
    var R = Math.max.apply(null, V);
    if (A.length > R)
      return b = new TypeError("Too many arguments in function " + O + " (expected: " + R + ", actual: " + A.length + ")"), b.data = {
        category: "tooManyArgs",
        fn: O,
        index: A.length,
        expectedLength: R
      }, b;
    for (var dt = [], st = 0; st < A.length; ++st)
      dt.push(o(A[st]).join("|"));
    return b = new TypeError('Arguments of type "' + dt.join(", ") + '" do not match any of the defined signatures of function ' + O + "."), b.data = {
      category: "mismatch",
      actual: dt
    }, b;
  }
  function U(m) {
    for (var A = n.length + 1, y = 0; y < m.types.length; y++)
      z(m.types[y]) && (A = Math.min(A, m.types[y].typeIndex));
    return A;
  }
  function W(m) {
    for (var A = i + 1, y = 0; y < m.types.length; y++)
      z(m.types[y]) || (A = Math.min(A, m.types[y].conversionIndex));
    return A;
  }
  function Y(m, A) {
    if (m.hasAny) {
      if (!A.hasAny)
        return 1;
    } else if (A.hasAny)
      return -1;
    if (m.restParam) {
      if (!A.restParam)
        return 1;
    } else if (A.restParam)
      return -1;
    if (m.hasConversion) {
      if (!A.hasConversion)
        return 1;
    } else if (A.hasConversion)
      return -1;
    var y = U(m) - U(A);
    if (y < 0)
      return -1;
    if (y > 0)
      return 1;
    var b = W(m) - W(A);
    return b < 0 ? -1 : b > 0 ? 1 : 0;
  }
  function H(m, A) {
    var y = m.params, b = A.params, T = Vt(y), O = Vt(b), x = N(y), I = N(b);
    if (x && T.hasAny) {
      if (!I || !O.hasAny)
        return 1;
    } else if (I && O.hasAny)
      return -1;
    var P = 0, $ = 0, V, R = Mt(y), dt;
    try {
      for (R.s(); !(dt = R.n()).done; )
        V = dt.value, V.hasAny && ++P, V.hasConversion && ++$;
    } catch (ne) {
      R.e(ne);
    } finally {
      R.f();
    }
    var st = 0, ht = 0, et = Mt(b), mt;
    try {
      for (et.s(); !(mt = et.n()).done; )
        V = mt.value, V.hasAny && ++st, V.hasConversion && ++ht;
    } catch (ne) {
      et.e(ne);
    } finally {
      et.f();
    }
    if (P !== st)
      return P - st;
    if (x && T.hasConversion) {
      if (!I || !O.hasConversion)
        return 1;
    } else if (I && O.hasConversion)
      return -1;
    if ($ !== ht)
      return $ - ht;
    if (x) {
      if (!I)
        return 1;
    } else if (I)
      return -1;
    var ut = (y.length - b.length) * (x ? -1 : 1);
    if (ut !== 0)
      return ut;
    for (var Bt = [], vt = 0, gt = 0; gt < y.length; ++gt) {
      var $t = Y(y[gt], b[gt]);
      Bt.push($t), vt += $t;
    }
    if (vt !== 0)
      return vt;
    for (var Et, jt = 0, ce = Bt; jt < ce.length; jt++)
      if (Et = ce[jt], Et !== 0)
        return Et;
    return 0;
  }
  function ot(m) {
    if (m.length === 0)
      return [];
    var A = m.map(h);
    m.length > 1 && A.sort(function(P, $) {
      return P.index - $.index;
    });
    var y = A[0].conversionsTo;
    if (m.length === 1)
      return y;
    y = y.concat([]);
    for (var b = new Set(m), T = 1; T < A.length; ++T) {
      var O = void 0, x = Mt(A[T].conversionsTo), I;
      try {
        for (x.s(); !(I = x.n()).done; )
          O = I.value, b.has(O.from) || (y.push(O), b.add(O.from));
      } catch (P) {
        x.e(P);
      } finally {
        x.f();
      }
    }
    return y;
  }
  function pt(m, A) {
    var y = A;
    if (m.some(function(I) {
      return I.hasConversion;
    })) {
      var b = N(m), T = m.map(G);
      y = function() {
        for (var P = [], $ = b ? arguments.length - 1 : arguments.length, V = 0; V < $; V++)
          P[V] = T[V](arguments[V]);
        return b && (P[$] = arguments[$].map(T[$])), A.apply(this, P);
      };
    }
    var O = y;
    if (N(m)) {
      var x = m.length - 1;
      O = function() {
        return y.apply(this, ke(arguments, 0, x).concat([ke(arguments, x)]));
      };
    }
    return O;
  }
  function G(m) {
    var A, y, b, T, O = [], x = [];
    switch (m.types.forEach(function(I) {
      I.conversion && (O.push(h(I.conversion.from).test), x.push(I.conversion.convert));
    }), x.length) {
      case 0:
        return function(P) {
          return P;
        };
      case 1:
        return A = O[0], b = x[0], function(P) {
          return A(P) ? b(P) : P;
        };
      case 2:
        return A = O[0], y = O[1], b = x[0], T = x[1], function(P) {
          return A(P) ? b(P) : y(P) ? T(P) : P;
        };
      default:
        return function(P) {
          for (var $ = 0; $ < x.length; $++)
            if (O[$](P))
              return x[$](P);
          return P;
        };
    }
  }
  function Ct(m) {
    function A(y, b, T) {
      if (b < y.length) {
        var O = y[b], x = [];
        if (O.restParam) {
          var I = O.types.filter(z);
          I.length < O.types.length && x.push({
            types: I,
            name: "..." + I.map(function(P) {
              return P.name;
            }).join("|"),
            hasAny: I.some(function(P) {
              return P.isAny;
            }),
            hasConversion: !1,
            restParam: !0
          }), x.push(O);
        } else
          x = O.types.map(function(P) {
            return {
              types: [P],
              name: P.name,
              hasAny: P.isAny,
              hasConversion: P.conversion,
              restParam: !1
            };
          });
        return wn(x, function(P) {
          return A(y, b + 1, T.concat([P]));
        });
      } else
        return [T];
    }
    return A(m, 0, []);
  }
  function Pe(m, A) {
    for (var y = Math.max(m.length, A.length), b = 0; b < y; b++) {
      var T = _(m, b), O = _(A, b), x = !1, I = void 0, P = Mt(O), $;
      try {
        for (P.s(); !($ = P.n()).done; )
          if (I = $.value, T.has(I)) {
            x = !0;
            break;
          }
      } catch (ht) {
        P.e(ht);
      } finally {
        P.f();
      }
      if (!x)
        return !1;
    }
    var V = m.length, R = A.length, dt = N(m), st = N(A);
    return dt ? st ? V === R : R >= V : st ? V >= R : V === R;
  }
  function ir(m) {
    return m.map(function(A) {
      return hr(A) ? fr(A.referToSelf.callback) : cr(A) ? ar(A.referTo.references, A.referTo.callback) : A;
    });
  }
  function Zt(m, A, y) {
    var b = [], T, O = Mt(m), x;
    try {
      for (O.s(); !(x = O.n()).done; ) {
        T = x.value;
        var I = y[T];
        if (typeof I != "number")
          throw new TypeError('No definition for referenced signature "' + T + '"');
        if (I = A[I], typeof I != "function")
          return !1;
        b.push(I);
      }
    } catch (P) {
      O.e(P);
    } finally {
      O.f();
    }
    return b;
  }
  function fe(m, A, y) {
    for (var b = ir(m), T = new Array(b.length).fill(!1), O = !0; O; ) {
      O = !1;
      for (var x = !0, I = 0; I < b.length; ++I)
        if (!T[I]) {
          var P = b[I];
          if (hr(P))
            b[I] = P.referToSelf.callback(y), b[I].referToSelf = P.referToSelf, T[I] = !0, x = !1;
          else if (cr(P)) {
            var $ = Zt(P.referTo.references, b, A);
            $ ? (b[I] = P.referTo.callback.apply(this, $), b[I].referTo = P.referTo, T[I] = !0, x = !1) : O = !0;
          }
        }
      if (x && O)
        throw new SyntaxError("Circular reference detected in resolving typed.referTo");
    }
    return b;
  }
  function xe(m) {
    var A = /\bthis(\(|\.signatures\b)/;
    Object.keys(m).forEach(function(y) {
      var b = m[y];
      if (A.test(b.toString()))
        throw new SyntaxError("Using `this` to self-reference a function is deprecated since typed-function@3. Use typed.referTo and typed.referToSelf instead.");
    });
  }
  function Fn(m, A) {
    if (s.createCount++, Object.keys(A).length === 0)
      throw new SyntaxError("No signatures provided");
    s.warnAgainstDeprecatedThis && xe(A);
    var y = [], b = [], T = {}, O = [], x, I = function() {
      if (!Object.prototype.hasOwnProperty.call(A, x))
        return "continue";
      var at = w(x);
      if (!at)
        return "continue";
      y.forEach(function(Wt) {
        if (Pe(Wt, at))
          throw new TypeError('Conflicting signatures "' + v(Wt) + '" and "' + v(at) + '".');
      }), y.push(at);
      var pr = b.length;
      b.push(A[x]);
      var Qn = at.map(F), he = void 0, le = Mt(Ct(Qn)), dr;
      try {
        for (le.s(); !(dr = le.n()).done; ) {
          he = dr.value;
          var vr = v(he);
          O.push({
            params: he,
            name: vr,
            fn: pr
          }), he.every(function(Wt) {
            return !Wt.hasConversion;
          }) && (T[vr] = pr);
        }
      } catch (Wt) {
        le.e(Wt);
      } finally {
        le.f();
      }
    };
    for (x in A)
      var P = I();
    O.sort(H);
    var $ = fe(b, T, ie), V;
    for (V in T)
      Object.prototype.hasOwnProperty.call(T, V) && (T[V] = $[T[V]]);
    for (var R = [], dt = /* @__PURE__ */ new Map(), st = 0, ht = O; st < ht.length; st++)
      V = ht[st], dt.has(V.name) || (V.fn = $[V.fn], R.push(V), dt.set(V.name, V));
    for (var et = R[0] && R[0].params.length <= 2 && !N(R[0].params), mt = R[1] && R[1].params.length <= 2 && !N(R[1].params), ut = R[2] && R[2].params.length <= 2 && !N(R[2].params), Bt = R[3] && R[3].params.length <= 2 && !N(R[3].params), vt = R[4] && R[4].params.length <= 2 && !N(R[4].params), gt = R[5] && R[5].params.length <= 2 && !N(R[5].params), $t = et && mt && ut && Bt && vt && gt, Et = 0; Et < R.length; ++Et)
      R[Et].test = M(R[Et].params);
    for (var jt = et ? B(R[0].params[0]) : Nt, ce = mt ? B(R[1].params[0]) : Nt, ne = ut ? B(R[2].params[0]) : Nt, _n = Bt ? B(R[3].params[0]) : Nt, Mn = vt ? B(R[4].params[0]) : Nt, bn = gt ? B(R[5].params[0]) : Nt, Sn = et ? B(R[0].params[1]) : Nt, In = mt ? B(R[1].params[1]) : Nt, Tn = ut ? B(R[2].params[1]) : Nt, On = Bt ? B(R[3].params[1]) : Nt, Pn = vt ? B(R[4].params[1]) : Nt, xn = gt ? B(R[5].params[1]) : Nt, ue = 0; ue < R.length; ++ue)
      R[ue].implementation = pt(R[ue].params, R[ue].fn);
    var kn = et ? R[0].implementation : Yt, Rn = mt ? R[1].implementation : Yt, zn = ut ? R[2].implementation : Yt, Ln = Bt ? R[3].implementation : Yt, qn = vt ? R[4].implementation : Yt, Un = gt ? R[5].implementation : Yt, $n = et ? R[0].params.length : -1, jn = mt ? R[1].params.length : -1, Hn = ut ? R[2].params.length : -1, Zn = Bt ? R[3].params.length : -1, Vn = vt ? R[4].params.length : -1, Wn = gt ? R[5].params.length : -1, Yn = $t ? 6 : 0, Xn = R.length, Gn = R.map(function(yt) {
      return yt.test;
    }), Jn = R.map(function(yt) {
      return yt.implementation;
    }), Kn = function() {
      for (var at = Yn; at < Xn; at++)
        if (Gn[at](arguments))
          return Jn[at].apply(this, arguments);
      return s.onMismatch(m, arguments, R);
    };
    function ie(yt, at) {
      return arguments.length === $n && jt(yt) && Sn(at) ? kn.apply(this, arguments) : arguments.length === jn && ce(yt) && In(at) ? Rn.apply(this, arguments) : arguments.length === Hn && ne(yt) && Tn(at) ? zn.apply(this, arguments) : arguments.length === Zn && _n(yt) && On(at) ? Ln.apply(this, arguments) : arguments.length === Vn && Mn(yt) && Pn(at) ? qn.apply(this, arguments) : arguments.length === Wn && bn(yt) && xn(at) ? Un.apply(this, arguments) : Kn.apply(this, arguments);
    }
    try {
      Object.defineProperty(ie, "name", {
        value: m
      });
    } catch {
    }
    return ie.signatures = T, ie._typedFunctionData = {
      signatures: R,
      signatureMap: dt
    }, ie;
  }
  function or(m, A, y) {
    throw L(m, A, y);
  }
  function sr(m) {
    return ke(m, 0, m.length - 1);
  }
  function Vt(m) {
    return m[m.length - 1];
  }
  function ke(m, A, y) {
    return Array.prototype.slice.call(m, A, y);
  }
  function An(m, A) {
    for (var y = 0; y < m.length; y++)
      if (A(m[y]))
        return m[y];
  }
  function wn(m, A) {
    return Array.prototype.concat.apply([], m.map(A));
  }
  function Cn() {
    var m = sr(arguments).map(function(y) {
      return v(w(y));
    }), A = Vt(arguments);
    if (typeof A != "function")
      throw new TypeError("Callback function expected as last argument");
    return ar(m, A);
  }
  function ar(m, A) {
    return {
      referTo: {
        references: m,
        callback: A
      }
    };
  }
  function fr(m) {
    if (typeof m != "function")
      throw new TypeError("Callback function expected as first argument");
    return {
      referToSelf: {
        callback: m
      }
    };
  }
  function cr(m) {
    return m && Gt(m.referTo) === "object" && Array.isArray(m.referTo.references) && typeof m.referTo.callback == "function";
  }
  function hr(m) {
    return m && Gt(m.referToSelf) === "object" && typeof m.referToSelf.callback == "function";
  }
  function lr(m, A) {
    if (!m)
      return A;
    if (A && A !== m) {
      var y = new Error("Function names do not match (expected: " + m + ", actual: " + A + ")");
      throw y.data = {
        actual: A,
        expected: m
      }, y;
    }
    return m;
  }
  function yn(m) {
    var A;
    for (var y in m)
      Object.prototype.hasOwnProperty.call(m, y) && (f(m[y]) || typeof m[y].signature == "string") && (A = lr(A, m[y].name));
    return A;
  }
  function Bn(m, A) {
    var y;
    for (y in A)
      if (Object.prototype.hasOwnProperty.call(A, y)) {
        if (y in m && A[y] !== m[y]) {
          var b = new Error('Signature "' + y + '" is defined twice');
          throw b.data = {
            signature: y,
            sourceFunction: A[y],
            destFunction: m[y]
          }, b;
        }
        m[y] = A[y];
      }
  }
  var Nn = s;
  s = function(A) {
    for (var y = typeof A == "string", b = y ? 1 : 0, T = y ? A : "", O = {}, x = b; x < arguments.length; ++x) {
      var I = arguments[x], P = {}, $ = void 0;
      if (typeof I == "function" ? ($ = I.name, typeof I.signature == "string" ? P[I.signature] = I : f(I) && (P = I.signatures)) : t(I) && (P = I, y || ($ = yn(I))), Object.keys(P).length === 0) {
        var V = new TypeError("Argument to 'typed' at index " + x + " is not a (typed) function, nor an object with signatures as keys and functions as values.");
        throw V.data = {
          index: x,
          argument: I
        }, V;
      }
      y || (T = lr(T, $)), Bn(O, P);
    }
    return Fn(T || "", O);
  }, s.create = Vr, s.createCount = Nn.createCount, s.onMismatch = or, s.throwMismatchError = or, s.createError = L, s.clear = p, s.clearConversions = a, s.addTypes = D, s._findType = h, s.referTo = Cn, s.referToSelf = fr, s.convert = c, s.findSignature = l, s.find = g, s.isTypedFunction = f, s.warnAgainstDeprecatedThis = !0, s.addType = function(m, A) {
    var y = "any";
    A !== !1 && u.has("Object") && (y = "Object"), s.addTypes([m], y);
  };
  function Dr(m) {
    if (!m || typeof m.from != "string" || typeof m.to != "string" || typeof m.convert != "function")
      throw new TypeError("Object with properties {from: string, to: string, convert: function} expected");
    if (m.to === m.from)
      throw new SyntaxError('Illegal to define conversion from "' + m.from + '" to itself.');
  }
  return s.addConversion = function(m) {
    Dr(m);
    var A = h(m.to);
    if (A.conversionsTo.every(function(y) {
      return y.from !== m.from;
    }))
      A.conversionsTo.push({
        from: m.from,
        convert: m.convert,
        index: i++
      });
    else
      throw new Error('There is already a conversion from "' + m.from + '" to "' + A.name + '"');
  }, s.addConversions = function(m) {
    m.forEach(s.addConversion);
  }, s.removeConversion = function(m) {
    Dr(m);
    var A = h(m.to), y = An(A.conversionsTo, function(T) {
      return T.from === m.from;
    });
    if (!y)
      throw new Error("Attempt to remove nonexistent conversion from " + m.from + " to " + m.to);
    if (y.convert !== m.convert)
      throw new Error("Conversion to remove does not match existing conversion");
    var b = A.conversionsTo.indexOf(y);
    A.conversionsTo.splice(b, 1);
  }, s.resolve = function(m, A) {
    if (!f(m))
      throw new TypeError(yr);
    for (var y = m._typedFunctionData.signatures, b = 0; b < y.length; ++b)
      if (y[b].test(A))
        return y[b];
    return null;
  }, s;
}
const Br = Vr();
function it(t) {
  return typeof t == "boolean" ? !0 : isFinite(t) ? t === Math.round(t) : !1;
}
function ze(t, e, r) {
  var u = {
    2: "0b",
    8: "0o",
    16: "0x"
  }, n = u[e], i = "";
  if (r) {
    if (r < 1)
      throw new Error("size must be in greater than 0");
    if (!it(r))
      throw new Error("size must be an integer");
    if (t > 2 ** (r - 1) - 1 || t < -(2 ** (r - 1)))
      throw new Error("Value must be in range [-2^".concat(r - 1, ", 2^").concat(r - 1, "-1]"));
    if (!it(t))
      throw new Error("Value must be an integer");
    t < 0 && (t = t + 2 ** r), i = "i".concat(r);
  }
  var s = "";
  return t < 0 && (t = -t, s = "-"), "".concat(s).concat(n).concat(t.toString(e)).concat(i);
}
function Ze(t, e) {
  if (typeof e == "function")
    return e(t);
  if (t === 1 / 0)
    return "Infinity";
  if (t === -1 / 0)
    return "-Infinity";
  if (isNaN(t))
    return "NaN";
  var r = "auto", u, n;
  if (e && (e.notation && (r = e.notation), tt(e) ? u = e : tt(e.precision) && (u = e.precision), e.wordSize && (n = e.wordSize, typeof n != "number")))
    throw new Error('Option "wordSize" must be a number');
  switch (r) {
    case "fixed":
      return Gu(t, u);
    case "exponential":
      return Wr(t, u);
    case "engineering":
      return Xu(t, u);
    case "bin":
      return ze(t, 2, n);
    case "oct":
      return ze(t, 8, n);
    case "hex":
      return ze(t, 16, n);
    case "auto":
      return Ju(t, u, e && e).replace(/((\.\d*?)(0+))($|e)/, function() {
        var i = arguments[2], s = arguments[4];
        return i !== "." ? i + s : s;
      });
    default:
      throw new Error('Unknown notation "' + r + '". Choose "auto", "exponential", "fixed", "bin", "oct", or "hex.');
  }
}
function be(t) {
  var e = String(t).toLowerCase().match(/^(-?)(\d+\.?\d*)(e([+-]?\d+))?$/);
  if (!e)
    throw new SyntaxError("Invalid number " + t);
  var r = e[1], u = e[2], n = parseFloat(e[4] || "0"), i = u.indexOf(".");
  n += i !== -1 ? i - 1 : u.length - 1;
  var s = u.replace(".", "").replace(/^0*/, function(h) {
    return n -= h.length, "";
  }).replace(/0*$/, "").split("").map(function(h) {
    return parseInt(h);
  });
  return s.length === 0 && (s.push(0), n++), {
    sign: r,
    coefficients: s,
    exponent: n
  };
}
function Xu(t, e) {
  if (isNaN(t) || !isFinite(t))
    return String(t);
  var r = be(t), u = Se(r, e), n = u.exponent, i = u.coefficients, s = n % 3 === 0 ? n : n < 0 ? n - 3 - n % 3 : n - n % 3;
  if (tt(e))
    for (; e > i.length || n - s + 1 > i.length; )
      i.push(0);
  else
    for (var h = Math.abs(n - s) - (i.length - 1), D = 0; D < h; D++)
      i.push(0);
  for (var p = Math.abs(n - s), a = 1; p > 0; )
    a++, p--;
  var o = i.slice(a).join(""), f = tt(e) && o.length || o.match(/[1-9]/) ? "." + o : "", l = i.slice(0, a).join("") + f + "e" + (n >= 0 ? "+" : "") + s.toString();
  return u.sign + l;
}
function Gu(t, e) {
  if (isNaN(t) || !isFinite(t))
    return String(t);
  var r = be(t), u = typeof e == "number" ? Se(r, r.exponent + 1 + e) : r, n = u.coefficients, i = u.exponent + 1, s = i + (e || 0);
  return n.length < s && (n = n.concat(Kt(s - n.length))), i < 0 && (n = Kt(-i + 1).concat(n), i = 1), i < n.length && n.splice(i, 0, i === 0 ? "0." : "."), u.sign + n.join("");
}
function Wr(t, e) {
  if (isNaN(t) || !isFinite(t))
    return String(t);
  var r = be(t), u = e ? Se(r, e) : r, n = u.coefficients, i = u.exponent;
  n.length < e && (n = n.concat(Kt(e - n.length)));
  var s = n.shift();
  return u.sign + s + (n.length > 0 ? "." + n.join("") : "") + "e" + (i >= 0 ? "+" : "") + i;
}
function Ju(t, e, r) {
  if (isNaN(t) || !isFinite(t))
    return String(t);
  var u = r && r.lowerExp !== void 0 ? r.lowerExp : -3, n = r && r.upperExp !== void 0 ? r.upperExp : 5, i = be(t), s = e ? Se(i, e) : i;
  if (s.exponent < u || s.exponent >= n)
    return Wr(t, e);
  var h = s.coefficients, D = s.exponent;
  h.length < e && (h = h.concat(Kt(e - h.length))), h = h.concat(Kt(D - h.length + 1 + (h.length < e ? e - h.length : 0))), h = Kt(-D).concat(h);
  var p = D > 0 ? D : 0;
  return p < h.length - 1 && h.splice(p + 1, 0, "."), s.sign + h.join("");
}
function Se(t, e) {
  for (var r = {
    sign: t.sign,
    coefficients: t.coefficients,
    exponent: t.exponent
  }, u = r.coefficients; e <= 0; )
    u.unshift(0), r.exponent++, e++;
  if (u.length > e) {
    var n = u.splice(e, u.length - e);
    if (n[0] >= 5) {
      var i = e - 1;
      for (u[i]++; u[i] === 10; )
        u.pop(), i === 0 && (u.unshift(0), r.exponent++, i++), i--, u[i]++;
    }
  }
  return r;
}
function Kt(t) {
  for (var e = [], r = 0; r < t; r++)
    e.push(0);
  return e;
}
function Ku(t) {
  return t.toExponential().replace(/e.*$/, "").replace(/^0\.?0*|\./, "").length;
}
var Qu = Number.EPSILON || 2220446049250313e-31;
function Ae(t, e, r) {
  if (r == null)
    return t === e;
  if (t === e)
    return !0;
  if (isNaN(t) || isNaN(e))
    return !1;
  if (isFinite(t) && isFinite(e)) {
    var u = Math.abs(t - e);
    return u < Qu ? !0 : u <= Math.max(Math.abs(t), Math.abs(e)) * r;
  }
  return !1;
}
function Le(t, e, r) {
  var u = t.constructor, n = new u(2), i = "";
  if (r) {
    if (r < 1)
      throw new Error("size must be in greater than 0");
    if (!it(r))
      throw new Error("size must be an integer");
    if (t.greaterThan(n.pow(r - 1).sub(1)) || t.lessThan(n.pow(r - 1).mul(-1)))
      throw new Error("Value must be in range [-2^".concat(r - 1, ", 2^").concat(r - 1, "-1]"));
    if (!t.isInteger())
      throw new Error("Value must be an integer");
    t.lessThan(0) && (t = t.add(n.pow(r))), i = "i".concat(r);
  }
  switch (e) {
    case 2:
      return "".concat(t.toBinary()).concat(i);
    case 8:
      return "".concat(t.toOctal()).concat(i);
    case 16:
      return "".concat(t.toHexadecimal()).concat(i);
    default:
      throw new Error("Base ".concat(e, " not supported "));
  }
}
function ti(t, e) {
  if (typeof e == "function")
    return e(t);
  if (!t.isFinite())
    return t.isNaN() ? "NaN" : t.gt(0) ? "Infinity" : "-Infinity";
  var r = "auto", u, n;
  if (e !== void 0 && (e.notation && (r = e.notation), typeof e == "number" ? u = e : e.precision && (u = e.precision), e.wordSize && (n = e.wordSize, typeof n != "number")))
    throw new Error('Option "wordSize" must be a number');
  switch (r) {
    case "fixed":
      return ri(t, u);
    case "exponential":
      return Nr(t, u);
    case "engineering":
      return ei(t, u);
    case "bin":
      return Le(t, 2, n);
    case "oct":
      return Le(t, 8, n);
    case "hex":
      return Le(t, 16, n);
    case "auto": {
      var i = e && e.lowerExp !== void 0 ? e.lowerExp : -3, s = e && e.upperExp !== void 0 ? e.upperExp : 5;
      if (t.isZero())
        return "0";
      var h, D = t.toSignificantDigits(u), p = D.e;
      return p >= i && p < s ? h = D.toFixed() : h = Nr(t, u), h.replace(/((\.\d*?)(0+))($|e)/, function() {
        var a = arguments[2], o = arguments[4];
        return a !== "." ? a + o : o;
      });
    }
    default:
      throw new Error('Unknown notation "' + r + '". Choose "auto", "exponential", "fixed", "bin", "oct", or "hex.');
  }
}
function ei(t, e) {
  var r = t.e, u = r % 3 === 0 ? r : r < 0 ? r - 3 - r % 3 : r - r % 3, n = t.mul(Math.pow(10, -u)), i = n.toPrecision(e);
  return i.indexOf("e") !== -1 && (i = n.toString()), i + "e" + (r >= 0 ? "+" : "") + u.toString();
}
function Nr(t, e) {
  return e !== void 0 ? t.toExponential(e - 1) : t.toExponential();
}
function ri(t, e) {
  return t.toFixed(e);
}
function Ft(t, e) {
  var r = ni(t, e);
  return e && typeof e == "object" && "truncate" in e && r.length > e.truncate ? r.substring(0, e.truncate - 3) + "..." : r;
}
function ni(t, e) {
  if (typeof t == "number")
    return Ze(t, e);
  if (_t(t))
    return ti(t, e);
  if (ui(t))
    return !e || e.fraction !== "decimal" ? t.s * t.n + "/" + t.d : t.toString();
  if (Array.isArray(t))
    return Yr(t, e);
  if (Tt(t))
    return '"' + t + '"';
  if (typeof t == "function")
    return t.syntax ? String(t.syntax) : "function";
  if (t && typeof t == "object") {
    if (typeof t.format == "function")
      return t.format(e);
    if (t && t.toString(e) !== {}.toString())
      return t.toString(e);
    var r = Object.keys(t).map((u) => '"' + u + '": ' + Ft(t[u], e));
    return "{" + r.join(", ") + "}";
  }
  return String(t);
}
function Yr(t, e) {
  if (Array.isArray(t)) {
    for (var r = "[", u = t.length, n = 0; n < u; n++)
      n !== 0 && (r += ", "), r += Yr(t[n], e);
    return r += "]", r;
  } else
    return Ft(t, e);
}
function ui(t) {
  return t && typeof t == "object" && typeof t.s == "number" && typeof t.n == "number" && typeof t.d == "number" || !1;
}
function Q(t, e, r) {
  if (!(this instanceof Q))
    throw new SyntaxError("Constructor must be called with the new operator");
  this.actual = t, this.expected = e, this.relation = r, this.message = "Dimension mismatch (" + (Array.isArray(t) ? "[" + t.join(", ") + "]" : t) + " " + (this.relation || "!=") + " " + (Array.isArray(e) ? "[" + e.join(", ") + "]" : e) + ")", this.stack = new Error().stack;
}
Q.prototype = new RangeError();
Q.prototype.constructor = RangeError;
Q.prototype.name = "DimensionError";
Q.prototype.isDimensionError = !0;
function ee(t, e, r) {
  if (!(this instanceof ee))
    throw new SyntaxError("Constructor must be called with the new operator");
  this.index = t, arguments.length < 3 ? (this.min = 0, this.max = e) : (this.min = e, this.max = r), this.min !== void 0 && this.index < this.min ? this.message = "Index out of range (" + this.index + " < " + this.min + ")" : this.max !== void 0 && this.index >= this.max ? this.message = "Index out of range (" + this.index + " > " + (this.max - 1) + ")" : this.message = "Index out of range (" + this.index + ")", this.stack = new Error().stack;
}
ee.prototype = new RangeError();
ee.prototype.constructor = RangeError;
ee.prototype.name = "IndexError";
ee.prototype.isIndexError = !0;
function we(t) {
  for (var e = []; Array.isArray(t); )
    e.push(t.length), t = t[0];
  return e;
}
function Xr(t, e, r) {
  var u, n = t.length;
  if (n !== e[r])
    throw new Q(n, e[r]);
  if (r < e.length - 1) {
    var i = r + 1;
    for (u = 0; u < n; u++) {
      var s = t[u];
      if (!Array.isArray(s))
        throw new Q(e.length - 1, e.length, "<");
      Xr(t[u], e, i);
    }
  } else
    for (u = 0; u < n; u++)
      if (Array.isArray(t[u]))
        throw new Q(e.length + 1, e.length, ">");
}
function _r(t, e) {
  var r = e.length === 0;
  if (r) {
    if (Array.isArray(t))
      throw new Q(t.length, 0);
  } else
    Xr(t, e, 0);
}
function K(t, e) {
  if (!tt(t) || !it(t))
    throw new TypeError("Index must be an integer (value: " + t + ")");
  if (t < 0 || typeof e == "number" && t >= e)
    throw new ee(t, e);
}
function Ve(t, e, r) {
  if (!Array.isArray(t) || !Array.isArray(e))
    throw new TypeError("Array expected");
  if (e.length === 0)
    throw new Error("Resizing to scalar is not supported");
  e.forEach(function(n) {
    if (!tt(n) || !it(n) || n < 0)
      throw new TypeError("Invalid size, must contain positive integers (size: " + Ft(e) + ")");
  });
  var u = r !== void 0 ? r : 0;
  return We(t, e, 0, u), t;
}
function We(t, e, r, u) {
  var n, i, s = t.length, h = e[r], D = Math.min(s, h);
  if (t.length = h, r < e.length - 1) {
    var p = r + 1;
    for (n = 0; n < D; n++)
      i = t[n], Array.isArray(i) || (i = [i], t[n] = i), We(i, e, p, u);
    for (n = D; n < h; n++)
      i = [], t[n] = i, We(i, e, p, u);
  } else {
    for (n = 0; n < D; n++)
      for (; Array.isArray(t[n]); )
        t[n] = t[n][0];
    for (n = D; n < h; n++)
      t[n] = u;
  }
}
function ii(t, e) {
  var r = Ye(t), u = r.length;
  if (!Array.isArray(t) || !Array.isArray(e))
    throw new TypeError("Array expected");
  if (e.length === 0)
    throw new Q(0, u, "!=");
  e = er(e, u);
  var n = Gr(e);
  if (u !== n)
    throw new Q(n, u, "!=");
  try {
    return oi(r, e);
  } catch (i) {
    throw i instanceof Q ? new Q(n, u, "!=") : i;
  }
}
function er(t, e) {
  var r = Gr(t), u = t.slice(), n = -1, i = t.indexOf(n), s = t.indexOf(n, i + 1) >= 0;
  if (s)
    throw new Error("More than one wildcard in sizes");
  var h = i >= 0, D = e % r === 0;
  if (h)
    if (D)
      u[i] = -e / r;
    else
      throw new Error("Could not replace wildcard, since " + e + " is no multiple of " + -r);
  return u;
}
function Gr(t) {
  return t.reduce((e, r) => e * r, 1);
}
function oi(t, e) {
  for (var r = t, u, n = e.length - 1; n > 0; n--) {
    var i = e[n];
    u = [];
    for (var s = r.length / i, h = 0; h < s; h++)
      u.push(r.slice(h * i, (h + 1) * i));
    r = u;
  }
  return r;
}
function Jr(t, e, r, u) {
  var n = u || we(t);
  if (r)
    for (var i = 0; i < r; i++)
      t = [t], n.unshift(1);
  for (t = Kr(t, e, 0); n.length < e; )
    n.push(1);
  return t;
}
function Kr(t, e, r) {
  var u, n;
  if (Array.isArray(t)) {
    var i = r + 1;
    for (u = 0, n = t.length; u < n; u++)
      t[u] = Kr(t[u], e, i);
  } else
    for (var s = r; s < e; s++)
      t = [t];
  return t;
}
function Ye(t) {
  if (!Array.isArray(t))
    return t;
  var e = [];
  return t.forEach(function r(u) {
    Array.isArray(u) ? u.forEach(r) : e.push(u);
  }), e;
}
function Ce(t, e) {
  for (var r, u = 0, n = 0; n < t.length; n++) {
    var i = t[n], s = Array.isArray(i);
    if (n === 0 && s && (u = i.length), s && i.length !== u)
      return;
    var h = s ? Ce(i, e) : e(i);
    if (r === void 0)
      r = h;
    else if (r !== h)
      return "mixed";
  }
  return r;
}
function wt(t, e, r, u) {
  function n(i) {
    var s = Zu(i, e.map(fi));
    return si(t, e, i), r(s);
  }
  return n.isFactory = !0, n.fn = t, n.dependencies = e.slice().sort(), u && (n.meta = u), n;
}
function si(t, e, r) {
  var u = e.filter((i) => !ai(i)).every((i) => r[i] !== void 0);
  if (!u) {
    var n = e.filter((i) => r[i] === void 0);
    throw new Error('Cannot create function "'.concat(t, '", ') + "some dependencies are missing: ".concat(n.map((i) => '"'.concat(i, '"')).join(", "), "."));
  }
}
function ai(t) {
  return t && t[0] === "?";
}
function fi(t) {
  return t && t[0] === "?" ? t.slice(1) : t;
}
function ci(t, e) {
  if (tn(t) && Qr(t, e))
    return t[e];
  throw typeof t[e] == "function" && Di(t, e) ? new Error('Cannot access method "' + e + '" as a property') : new Error('No access to property "' + e + '"');
}
function hi(t, e, r) {
  if (tn(t) && Qr(t, e))
    return t[e] = r, r;
  throw new Error('No access to property "' + e + '"');
}
function li(t, e) {
  return e in t;
}
function Qr(t, e) {
  return !t || typeof t != "object" ? !1 : Fe(pi, e) ? !0 : !(e in Object.prototype || e in Function.prototype);
}
function Di(t, e) {
  return t == null || typeof t[e] != "function" || Fe(t, e) && Object.getPrototypeOf && e in Object.getPrototypeOf(t) ? !1 : Fe(di, e) ? !0 : !(e in Object.prototype || e in Function.prototype);
}
function tn(t) {
  return typeof t == "object" && t && t.constructor === Object;
}
var pi = {
  length: !0,
  name: !0
}, di = {
  toString: !0,
  valueOf: !0,
  toLocaleString: !0
};
class vi {
  constructor(e) {
    this.wrappedObject = e;
  }
  keys() {
    return Object.keys(this.wrappedObject);
  }
  get(e) {
    return ci(this.wrappedObject, e);
  }
  set(e, r) {
    return hi(this.wrappedObject, e, r), this;
  }
  has(e) {
    return li(this.wrappedObject, e);
  }
}
function gi(t) {
  return t ? t instanceof Map || t instanceof vi || typeof t.set == "function" && typeof t.get == "function" && typeof t.keys == "function" && typeof t.has == "function" : !1;
}
var en = function() {
  return en = Br.create, Br;
}, mi = ["?BigNumber", "?Complex", "?DenseMatrix", "?Fraction"], Ei = /* @__PURE__ */ wt("typed", mi, function(e) {
  var {
    BigNumber: r,
    Complex: u,
    DenseMatrix: n,
    Fraction: i
  } = e, s = en();
  return s.clear(), s.addTypes([
    {
      name: "number",
      test: tt
    },
    {
      name: "Complex",
      test: jr
    },
    {
      name: "BigNumber",
      test: _t
    },
    {
      name: "Fraction",
      test: Hr
    },
    {
      name: "Unit",
      test: Zr
    },
    // The following type matches a valid variable name, i.e., an alphanumeric
    // string starting with an alphabetic character. It is used (at least)
    // in the definition of the derivative() function, as the argument telling
    // what to differentiate over must (currently) be a variable.
    {
      name: "identifier",
      test: (h) => Tt && /^(?:[A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088E\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF2D-\uDF40\uDF42-\uDF49\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF]|\uD801[\uDC00-\uDC9D\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67\uDF80-\uDF85\uDF87-\uDFB0\uDFB2-\uDFBA]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDD00-\uDD23\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF1C\uDF27\uDF30-\uDF45\uDF70-\uDF81\uDFB0-\uDFC4\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC71\uDC72\uDC75\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDEB8\uDF00-\uDF1A\uDF40-\uDF46]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCDF\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEB0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDEE0-\uDEF2\uDFB0]|\uD808[\uDC00-\uDF99]|\uD809[\uDC80-\uDD43]|\uD80B[\uDF90-\uDFF0]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE70-\uDEBE\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE7F\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82B[\uDFF0-\uDFF3\uDFF5-\uDFFB\uDFFD\uDFFE]|\uD82C[\uDC00-\uDD22\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD837[\uDF00-\uDF1E]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD4E\uDE90-\uDEAD\uDEC0-\uDEEB]|\uD839[\uDFE0-\uDFE6\uDFE8-\uDFEB\uDFED\uDFEE\uDFF0-\uDFFE]|\uD83A[\uDC00-\uDCC4\uDD00-\uDD43\uDD4B]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDEDF\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF38\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])(?:[0-9A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088E\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF2D-\uDF40\uDF42-\uDF49\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF]|\uD801[\uDC00-\uDC9D\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67\uDF80-\uDF85\uDF87-\uDFB0\uDFB2-\uDFBA]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDD00-\uDD23\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF1C\uDF27\uDF30-\uDF45\uDF70-\uDF81\uDFB0-\uDFC4\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC71\uDC72\uDC75\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDEB8\uDF00-\uDF1A\uDF40-\uDF46]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCDF\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEB0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDEE0-\uDEF2\uDFB0]|\uD808[\uDC00-\uDF99]|\uD809[\uDC80-\uDD43]|\uD80B[\uDF90-\uDFF0]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE70-\uDEBE\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE7F\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82B[\uDFF0-\uDFF3\uDFF5-\uDFFB\uDFFD\uDFFE]|\uD82C[\uDC00-\uDD22\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD837[\uDF00-\uDF1E]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD4E\uDE90-\uDEAD\uDEC0-\uDEEB]|\uD839[\uDFE0-\uDFE6\uDFE8-\uDFEB\uDFED\uDFEE\uDFF0-\uDFFE]|\uD83A[\uDC00-\uDCC4\uDD00-\uDD43\uDD4B]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDEDF\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF38\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])*$/.test(h)
    },
    {
      name: "string",
      test: Tt
    },
    {
      name: "Chain",
      test: ju
    },
    {
      name: "Array",
      test: J
    },
    {
      name: "Matrix",
      test: Lt
    },
    {
      name: "DenseMatrix",
      test: du
    },
    {
      name: "SparseMatrix",
      test: vu
    },
    {
      name: "Range",
      test: gu
    },
    {
      name: "Index",
      test: tr
    },
    {
      name: "boolean",
      test: mu
    },
    {
      name: "ResultSet",
      test: Eu
    },
    {
      name: "Help",
      test: Fu
    },
    {
      name: "function",
      test: Au
    },
    {
      name: "Date",
      test: wu
    },
    {
      name: "RegExp",
      test: Cu
    },
    {
      name: "null",
      test: Bu
    },
    {
      name: "undefined",
      test: Nu
    },
    {
      name: "AccessorNode",
      test: _u
    },
    {
      name: "ArrayNode",
      test: Mu
    },
    {
      name: "AssignmentNode",
      test: bu
    },
    {
      name: "BlockNode",
      test: Su
    },
    {
      name: "ConditionalNode",
      test: Iu
    },
    {
      name: "ConstantNode",
      test: Tu
    },
    {
      name: "FunctionNode",
      test: Pu
    },
    {
      name: "FunctionAssignmentNode",
      test: Ou
    },
    {
      name: "IndexNode",
      test: xu
    },
    {
      name: "Node",
      test: ku
    },
    {
      name: "ObjectNode",
      test: Ru
    },
    {
      name: "OperatorNode",
      test: zu
    },
    {
      name: "ParenthesisNode",
      test: Lu
    },
    {
      name: "RangeNode",
      test: qu
    },
    {
      name: "RelationalNode",
      test: Uu
    },
    {
      name: "SymbolNode",
      test: $u
    },
    {
      name: "Map",
      test: gi
    },
    {
      name: "Object",
      test: yu
    }
    // order 'Object' last, it matches on other classes too
  ]), s.addConversions([{
    from: "number",
    to: "BigNumber",
    convert: function(D) {
      if (r || qe(D), Ku(D) > 15)
        throw new TypeError("Cannot implicitly convert a number with >15 significant digits to BigNumber (value: " + D + "). Use function bignumber(x) to convert to BigNumber.");
      return new r(D);
    }
  }, {
    from: "number",
    to: "Complex",
    convert: function(D) {
      return u || pe(D), new u(D, 0);
    }
  }, {
    from: "BigNumber",
    to: "Complex",
    convert: function(D) {
      return u || pe(D), new u(D.toNumber(), 0);
    }
  }, {
    from: "Fraction",
    to: "BigNumber",
    convert: function(D) {
      throw new TypeError("Cannot implicitly convert a Fraction to BigNumber or vice versa. Use function bignumber(x) to convert to BigNumber or fraction(x) to convert to Fraction.");
    }
  }, {
    from: "Fraction",
    to: "Complex",
    convert: function(D) {
      return u || pe(D), new u(D.valueOf(), 0);
    }
  }, {
    from: "number",
    to: "Fraction",
    convert: function(D) {
      i || Ue(D);
      var p = new i(D);
      if (p.valueOf() !== D)
        throw new TypeError("Cannot implicitly convert a number to a Fraction when there will be a loss of precision (value: " + D + "). Use function fraction(x) to convert to Fraction.");
      return p;
    }
  }, {
    // FIXME: add conversion from Fraction to number, for example for `sqrt(fraction(1,3))`
    //  from: 'Fraction',
    //  to: 'number',
    //  convert: function (x) {
    //    return x.valueOf()
    //  }
    // }, {
    from: "string",
    to: "number",
    convert: function(D) {
      var p = Number(D);
      if (isNaN(p))
        throw new Error('Cannot convert "' + D + '" to a number');
      return p;
    }
  }, {
    from: "string",
    to: "BigNumber",
    convert: function(D) {
      r || qe(D);
      try {
        return new r(D);
      } catch {
        throw new Error('Cannot convert "' + D + '" to BigNumber');
      }
    }
  }, {
    from: "string",
    to: "Fraction",
    convert: function(D) {
      i || Ue(D);
      try {
        return new i(D);
      } catch {
        throw new Error('Cannot convert "' + D + '" to Fraction');
      }
    }
  }, {
    from: "string",
    to: "Complex",
    convert: function(D) {
      u || pe(D);
      try {
        return new u(D);
      } catch {
        throw new Error('Cannot convert "' + D + '" to Complex');
      }
    }
  }, {
    from: "boolean",
    to: "number",
    convert: function(D) {
      return +D;
    }
  }, {
    from: "boolean",
    to: "BigNumber",
    convert: function(D) {
      return r || qe(D), new r(+D);
    }
  }, {
    from: "boolean",
    to: "Fraction",
    convert: function(D) {
      return i || Ue(D), new i(+D);
    }
  }, {
    from: "boolean",
    to: "string",
    convert: function(D) {
      return String(D);
    }
  }, {
    from: "Array",
    to: "Matrix",
    convert: function(D) {
      return n || Fi(), new n(D);
    }
  }, {
    from: "Matrix",
    to: "Array",
    convert: function(D) {
      return D.valueOf();
    }
  }]), s.onMismatch = (h, D, p) => {
    var a = s.createError(h, D, p);
    if (["wrongType", "mismatch"].includes(a.data.category) && D.length === 1 && me(D[0]) && // check if the function can be unary:
    p.some((f) => !f.params.includes(","))) {
      var o = new TypeError("Function '".concat(h, "' doesn't apply to matrices. To call it ") + "elementwise on a matrix 'M', try 'map(M, ".concat(h, ")'."));
      throw o.data = a.data, o;
    }
    throw a;
  }, s.onMismatch = (h, D, p) => {
    var a = s.createError(h, D, p);
    if (["wrongType", "mismatch"].includes(a.data.category) && D.length === 1 && me(D[0]) && // check if the function can be unary:
    p.some((f) => !f.params.includes(","))) {
      var o = new TypeError("Function '".concat(h, "' doesn't apply to matrices. To call it ") + "elementwise on a matrix 'M', try 'map(M, ".concat(h, ")'."));
      throw o.data = a.data, o;
    }
    throw a;
  }, s;
});
function qe(t) {
  throw new Error("Cannot convert value ".concat(t, " into a BigNumber: no class 'BigNumber' provided"));
}
function pe(t) {
  throw new Error("Cannot convert value ".concat(t, " into a Complex number: no class 'Complex' provided"));
}
function Fi() {
  throw new Error("Cannot convert array into a Matrix: no class 'DenseMatrix' provided");
}
function Ue(t) {
  throw new Error("Cannot convert value ".concat(t, " into a Fraction, no class 'Fraction' provided."));
}
/*!
 *  decimal.js v10.4.3
 *  An arbitrary-precision Decimal type for JavaScript.
 *  https://github.com/MikeMcl/decimal.js
 *  Copyright (c) 2022 Michael Mclaughlin <M8ch88l@gmail.com>
 *  MIT Licence
 */
var Jt = 9e15, Ut = 1e9, Xe = "0123456789abcdef", ye = "2.3025850929940456840179914546843642076011014886287729760333279009675726096773524802359972050895982983419677840422862486334095254650828067566662873690987816894829072083255546808437998948262331985283935053089653777326288461633662222876982198867465436674744042432743651550489343149393914796194044002221051017141748003688084012647080685567743216228355220114804663715659121373450747856947683463616792101806445070648000277502684916746550586856935673420670581136429224554405758925724208241314695689016758940256776311356919292033376587141660230105703089634572075440370847469940168269282808481184289314848524948644871927809676271275775397027668605952496716674183485704422507197965004714951050492214776567636938662976979522110718264549734772662425709429322582798502585509785265383207606726317164309505995087807523710333101197857547331541421808427543863591778117054309827482385045648019095610299291824318237525357709750539565187697510374970888692180205189339507238539205144634197265287286965110862571492198849978748873771345686209167058", Be = "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679821480865132823066470938446095505822317253594081284811174502841027019385211055596446229489549303819644288109756659334461284756482337867831652712019091456485669234603486104543266482133936072602491412737245870066063155881748815209209628292540917153643678925903600113305305488204665213841469519415116094330572703657595919530921861173819326117931051185480744623799627495673518857527248912279381830119491298336733624406566430860213949463952247371907021798609437027705392171762931767523846748184676694051320005681271452635608277857713427577896091736371787214684409012249534301465495853710507922796892589235420199561121290219608640344181598136297747713099605187072113499999983729780499510597317328160963185950244594553469083026425223082533446850352619311881710100031378387528865875332083814206171776691473035982534904287554687311595628638823537875937519577818577805321712268066130019278766111959092164201989380952572010654858632789", Ge = {
  // These values must be integers within the stated ranges (inclusive).
  // Most of these values can be changed at run-time using the `Decimal.config` method.
  // The maximum number of significant digits of the result of a calculation or base conversion.
  // E.g. `Decimal.config({ precision: 20 });`
  precision: 20,
  // 1 to MAX_DIGITS
  // The rounding mode used when rounding to `precision`.
  //
  // ROUND_UP         0 Away from zero.
  // ROUND_DOWN       1 Towards zero.
  // ROUND_CEIL       2 Towards +Infinity.
  // ROUND_FLOOR      3 Towards -Infinity.
  // ROUND_HALF_UP    4 Towards nearest neighbour. If equidistant, up.
  // ROUND_HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
  // ROUND_HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
  // ROUND_HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
  // ROUND_HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
  //
  // E.g.
  // `Decimal.rounding = 4;`
  // `Decimal.rounding = Decimal.ROUND_HALF_UP;`
  rounding: 4,
  // 0 to 8
  // The modulo mode used when calculating the modulus: a mod n.
  // The quotient (q = a / n) is calculated according to the corresponding rounding mode.
  // The remainder (r) is calculated as: r = a - n * q.
  //
  // UP         0 The remainder is positive if the dividend is negative, else is negative.
  // DOWN       1 The remainder has the same sign as the dividend (JavaScript %).
  // FLOOR      3 The remainder has the same sign as the divisor (Python %).
  // HALF_EVEN  6 The IEEE 754 remainder function.
  // EUCLID     9 Euclidian division. q = sign(n) * floor(a / abs(n)). Always positive.
  //
  // Truncated division (1), floored division (3), the IEEE 754 remainder (6), and Euclidian
  // division (9) are commonly used for the modulus operation. The other rounding modes can also
  // be used, but they may not give useful results.
  modulo: 1,
  // 0 to 9
  // The exponent value at and beneath which `toString` returns exponential notation.
  // JavaScript numbers: -7
  toExpNeg: -7,
  // 0 to -EXP_LIMIT
  // The exponent value at and above which `toString` returns exponential notation.
  // JavaScript numbers: 21
  toExpPos: 21,
  // 0 to EXP_LIMIT
  // The minimum exponent value, beneath which underflow to zero occurs.
  // JavaScript numbers: -324  (5e-324)
  minE: -Jt,
  // -1 to -EXP_LIMIT
  // The maximum exponent value, above which overflow to Infinity occurs.
  // JavaScript numbers: 308  (1.7976931348623157e+308)
  maxE: Jt,
  // 1 to EXP_LIMIT
  // Whether to use cryptographically-secure random number generation, if available.
  crypto: !1
  // true/false
}, rn, kt, Z = !0, Ie = "[DecimalError] ", qt = Ie + "Invalid argument: ", nn = Ie + "Precision limit exceeded", un = Ie + "crypto unavailable", on = "[object Decimal]", Dt = Math.floor, nt = Math.pow, Ai = /^0b([01]+(\.[01]*)?|\.[01]+)(p[+-]?\d+)?$/i, wi = /^0x([0-9a-f]+(\.[0-9a-f]*)?|\.[0-9a-f]+)(p[+-]?\d+)?$/i, Ci = /^0o([0-7]+(\.[0-7]*)?|\.[0-7]+)(p[+-]?\d+)?$/i, sn = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i, St = 1e7, j = 7, yi = 9007199254740991, Bi = ye.length - 1, Je = Be.length - 1, S = { toStringTag: on };
S.absoluteValue = S.abs = function() {
  var t = new this.constructor(this);
  return t.s < 0 && (t.s = 1), q(t);
};
S.ceil = function() {
  return q(new this.constructor(this), this.e + 1, 2);
};
S.clampedTo = S.clamp = function(t, e) {
  var r, u = this, n = u.constructor;
  if (t = new n(t), e = new n(e), !t.s || !e.s)
    return new n(NaN);
  if (t.gt(e))
    throw Error(qt + e);
  return r = u.cmp(t), r < 0 ? t : u.cmp(e) > 0 ? e : new n(u);
};
S.comparedTo = S.cmp = function(t) {
  var e, r, u, n, i = this, s = i.d, h = (t = new i.constructor(t)).d, D = i.s, p = t.s;
  if (!s || !h)
    return !D || !p ? NaN : D !== p ? D : s === h ? 0 : !s ^ D < 0 ? 1 : -1;
  if (!s[0] || !h[0])
    return s[0] ? D : h[0] ? -p : 0;
  if (D !== p)
    return D;
  if (i.e !== t.e)
    return i.e > t.e ^ D < 0 ? 1 : -1;
  for (u = s.length, n = h.length, e = 0, r = u < n ? u : n; e < r; ++e)
    if (s[e] !== h[e])
      return s[e] > h[e] ^ D < 0 ? 1 : -1;
  return u === n ? 0 : u > n ^ D < 0 ? 1 : -1;
};
S.cosine = S.cos = function() {
  var t, e, r = this, u = r.constructor;
  return r.d ? r.d[0] ? (t = u.precision, e = u.rounding, u.precision = t + Math.max(r.e, r.sd()) + j, u.rounding = 1, r = Ni(u, ln(u, r)), u.precision = t, u.rounding = e, q(kt == 2 || kt == 3 ? r.neg() : r, t, e, !0)) : new u(1) : new u(NaN);
};
S.cubeRoot = S.cbrt = function() {
  var t, e, r, u, n, i, s, h, D, p, a = this, o = a.constructor;
  if (!a.isFinite() || a.isZero())
    return new o(a);
  for (Z = !1, i = a.s * nt(a.s * a, 1 / 3), !i || Math.abs(i) == 1 / 0 ? (r = ct(a.d), t = a.e, (i = (t - r.length + 1) % 3) && (r += i == 1 || i == -2 ? "0" : "00"), i = nt(r, 1 / 3), t = Dt((t + 1) / 3) - (t % 3 == (t < 0 ? -1 : 2)), i == 1 / 0 ? r = "5e" + t : (r = i.toExponential(), r = r.slice(0, r.indexOf("e") + 1) + t), u = new o(r), u.s = a.s) : u = new o(i.toString()), s = (t = o.precision) + 3; ; )
    if (h = u, D = h.times(h).times(h), p = D.plus(a), u = X(p.plus(a).times(h), p.plus(D), s + 2, 1), ct(h.d).slice(0, s) === (r = ct(u.d)).slice(0, s))
      if (r = r.slice(s - 3, s + 1), r == "9999" || !n && r == "4999") {
        if (!n && (q(h, t + 1, 0), h.times(h).times(h).eq(a))) {
          u = h;
          break;
        }
        s += 4, n = 1;
      } else {
        (!+r || !+r.slice(1) && r.charAt(0) == "5") && (q(u, t + 1, 1), e = !u.times(u).times(u).eq(a));
        break;
      }
  return Z = !0, q(u, t, o.rounding, e);
};
S.decimalPlaces = S.dp = function() {
  var t, e = this.d, r = NaN;
  if (e) {
    if (t = e.length - 1, r = (t - Dt(this.e / j)) * j, t = e[t], t)
      for (; t % 10 == 0; t /= 10)
        r--;
    r < 0 && (r = 0);
  }
  return r;
};
S.dividedBy = S.div = function(t) {
  return X(this, new this.constructor(t));
};
S.dividedToIntegerBy = S.divToInt = function(t) {
  var e = this, r = e.constructor;
  return q(X(e, new r(t), 0, 1, 1), r.precision, r.rounding);
};
S.equals = S.eq = function(t) {
  return this.cmp(t) === 0;
};
S.floor = function() {
  return q(new this.constructor(this), this.e + 1, 3);
};
S.greaterThan = S.gt = function(t) {
  return this.cmp(t) > 0;
};
S.greaterThanOrEqualTo = S.gte = function(t) {
  var e = this.cmp(t);
  return e == 1 || e === 0;
};
S.hyperbolicCosine = S.cosh = function() {
  var t, e, r, u, n, i = this, s = i.constructor, h = new s(1);
  if (!i.isFinite())
    return new s(i.s ? 1 / 0 : NaN);
  if (i.isZero())
    return h;
  r = s.precision, u = s.rounding, s.precision = r + Math.max(i.e, i.sd()) + 4, s.rounding = 1, n = i.d.length, n < 32 ? (t = Math.ceil(n / 3), e = (1 / Oe(4, t)).toString()) : (t = 16, e = "2.3283064365386962890625e-10"), i = Qt(s, 1, i.times(e), new s(1), !0);
  for (var D, p = t, a = new s(8); p--; )
    D = i.times(i), i = h.minus(D.times(a.minus(D.times(a))));
  return q(i, s.precision = r, s.rounding = u, !0);
};
S.hyperbolicSine = S.sinh = function() {
  var t, e, r, u, n = this, i = n.constructor;
  if (!n.isFinite() || n.isZero())
    return new i(n);
  if (e = i.precision, r = i.rounding, i.precision = e + Math.max(n.e, n.sd()) + 4, i.rounding = 1, u = n.d.length, u < 3)
    n = Qt(i, 2, n, n, !0);
  else {
    t = 1.4 * Math.sqrt(u), t = t > 16 ? 16 : t | 0, n = n.times(1 / Oe(5, t)), n = Qt(i, 2, n, n, !0);
    for (var s, h = new i(5), D = new i(16), p = new i(20); t--; )
      s = n.times(n), n = n.times(h.plus(s.times(D.times(s).plus(p))));
  }
  return i.precision = e, i.rounding = r, q(n, e, r, !0);
};
S.hyperbolicTangent = S.tanh = function() {
  var t, e, r = this, u = r.constructor;
  return r.isFinite() ? r.isZero() ? new u(r) : (t = u.precision, e = u.rounding, u.precision = t + 7, u.rounding = 1, X(r.sinh(), r.cosh(), u.precision = t, u.rounding = e)) : new u(r.s);
};
S.inverseCosine = S.acos = function() {
  var t, e = this, r = e.constructor, u = e.abs().cmp(1), n = r.precision, i = r.rounding;
  return u !== -1 ? u === 0 ? e.isNeg() ? bt(r, n, i) : new r(0) : new r(NaN) : e.isZero() ? bt(r, n + 4, i).times(0.5) : (r.precision = n + 6, r.rounding = 1, e = e.asin(), t = bt(r, n + 4, i).times(0.5), r.precision = n, r.rounding = i, t.minus(e));
};
S.inverseHyperbolicCosine = S.acosh = function() {
  var t, e, r = this, u = r.constructor;
  return r.lte(1) ? new u(r.eq(1) ? 0 : NaN) : r.isFinite() ? (t = u.precision, e = u.rounding, u.precision = t + Math.max(Math.abs(r.e), r.sd()) + 4, u.rounding = 1, Z = !1, r = r.times(r).minus(1).sqrt().plus(r), Z = !0, u.precision = t, u.rounding = e, r.ln()) : new u(r);
};
S.inverseHyperbolicSine = S.asinh = function() {
  var t, e, r = this, u = r.constructor;
  return !r.isFinite() || r.isZero() ? new u(r) : (t = u.precision, e = u.rounding, u.precision = t + 2 * Math.max(Math.abs(r.e), r.sd()) + 6, u.rounding = 1, Z = !1, r = r.times(r).plus(1).sqrt().plus(r), Z = !0, u.precision = t, u.rounding = e, r.ln());
};
S.inverseHyperbolicTangent = S.atanh = function() {
  var t, e, r, u, n = this, i = n.constructor;
  return n.isFinite() ? n.e >= 0 ? new i(n.abs().eq(1) ? n.s / 0 : n.isZero() ? n : NaN) : (t = i.precision, e = i.rounding, u = n.sd(), Math.max(u, t) < 2 * -n.e - 1 ? q(new i(n), t, e, !0) : (i.precision = r = u - n.e, n = X(n.plus(1), new i(1).minus(n), r + t, 1), i.precision = t + 4, i.rounding = 1, n = n.ln(), i.precision = t, i.rounding = e, n.times(0.5))) : new i(NaN);
};
S.inverseSine = S.asin = function() {
  var t, e, r, u, n = this, i = n.constructor;
  return n.isZero() ? new i(n) : (e = n.abs().cmp(1), r = i.precision, u = i.rounding, e !== -1 ? e === 0 ? (t = bt(i, r + 4, u).times(0.5), t.s = n.s, t) : new i(NaN) : (i.precision = r + 6, i.rounding = 1, n = n.div(new i(1).minus(n.times(n)).sqrt().plus(1)).atan(), i.precision = r, i.rounding = u, n.times(2)));
};
S.inverseTangent = S.atan = function() {
  var t, e, r, u, n, i, s, h, D, p = this, a = p.constructor, o = a.precision, f = a.rounding;
  if (p.isFinite()) {
    if (p.isZero())
      return new a(p);
    if (p.abs().eq(1) && o + 4 <= Je)
      return s = bt(a, o + 4, f).times(0.25), s.s = p.s, s;
  } else {
    if (!p.s)
      return new a(NaN);
    if (o + 4 <= Je)
      return s = bt(a, o + 4, f).times(0.5), s.s = p.s, s;
  }
  for (a.precision = h = o + 10, a.rounding = 1, r = Math.min(28, h / j + 2 | 0), t = r; t; --t)
    p = p.div(p.times(p).plus(1).sqrt().plus(1));
  for (Z = !1, e = Math.ceil(h / j), u = 1, D = p.times(p), s = new a(p), n = p; t !== -1; )
    if (n = n.times(D), i = s.minus(n.div(u += 2)), n = n.times(D), s = i.plus(n.div(u += 2)), s.d[e] !== void 0)
      for (t = e; s.d[t] === i.d[t] && t--; )
        ;
  return r && (s = s.times(2 << r - 1)), Z = !0, q(s, a.precision = o, a.rounding = f, !0);
};
S.isFinite = function() {
  return !!this.d;
};
S.isInteger = S.isInt = function() {
  return !!this.d && Dt(this.e / j) > this.d.length - 2;
};
S.isNaN = function() {
  return !this.s;
};
S.isNegative = S.isNeg = function() {
  return this.s < 0;
};
S.isPositive = S.isPos = function() {
  return this.s > 0;
};
S.isZero = function() {
  return !!this.d && this.d[0] === 0;
};
S.lessThan = S.lt = function(t) {
  return this.cmp(t) < 0;
};
S.lessThanOrEqualTo = S.lte = function(t) {
  return this.cmp(t) < 1;
};
S.logarithm = S.log = function(t) {
  var e, r, u, n, i, s, h, D, p = this, a = p.constructor, o = a.precision, f = a.rounding, l = 5;
  if (t == null)
    t = new a(10), e = !0;
  else {
    if (t = new a(t), r = t.d, t.s < 0 || !r || !r[0] || t.eq(1))
      return new a(NaN);
    e = t.eq(10);
  }
  if (r = p.d, p.s < 0 || !r || !r[0] || p.eq(1))
    return new a(r && !r[0] ? -1 / 0 : p.s != 1 ? NaN : r ? 0 : 1 / 0);
  if (e)
    if (r.length > 1)
      i = !0;
    else {
      for (n = r[0]; n % 10 === 0; )
        n /= 10;
      i = n !== 1;
    }
  if (Z = !1, h = o + l, s = zt(p, h), u = e ? Ne(a, h + 10) : zt(t, h), D = X(s, u, h, 1), ae(D.d, n = o, f))
    do
      if (h += 10, s = zt(p, h), u = e ? Ne(a, h + 10) : zt(t, h), D = X(s, u, h, 1), !i) {
        +ct(D.d).slice(n + 1, n + 15) + 1 == 1e14 && (D = q(D, o + 1, 0));
        break;
      }
    while (ae(D.d, n += 10, f));
  return Z = !0, q(D, o, f);
};
S.minus = S.sub = function(t) {
  var e, r, u, n, i, s, h, D, p, a, o, f, l = this, g = l.constructor;
  if (t = new g(t), !l.d || !t.d)
    return !l.s || !t.s ? t = new g(NaN) : l.d ? t.s = -t.s : t = new g(t.d || l.s !== t.s ? l : NaN), t;
  if (l.s != t.s)
    return t.s = -t.s, l.plus(t);
  if (p = l.d, f = t.d, h = g.precision, D = g.rounding, !p[0] || !f[0]) {
    if (f[0])
      t.s = -t.s;
    else if (p[0])
      t = new g(l);
    else
      return new g(D === 3 ? -0 : 0);
    return Z ? q(t, h, D) : t;
  }
  if (r = Dt(t.e / j), a = Dt(l.e / j), p = p.slice(), i = a - r, i) {
    for (o = i < 0, o ? (e = p, i = -i, s = f.length) : (e = f, r = a, s = p.length), u = Math.max(Math.ceil(h / j), s) + 2, i > u && (i = u, e.length = 1), e.reverse(), u = i; u--; )
      e.push(0);
    e.reverse();
  } else {
    for (u = p.length, s = f.length, o = u < s, o && (s = u), u = 0; u < s; u++)
      if (p[u] != f[u]) {
        o = p[u] < f[u];
        break;
      }
    i = 0;
  }
  for (o && (e = p, p = f, f = e, t.s = -t.s), s = p.length, u = f.length - s; u > 0; --u)
    p[s++] = 0;
  for (u = f.length; u > i; ) {
    if (p[--u] < f[u]) {
      for (n = u; n && p[--n] === 0; )
        p[n] = St - 1;
      --p[n], p[u] += St;
    }
    p[u] -= f[u];
  }
  for (; p[--s] === 0; )
    p.pop();
  for (; p[0] === 0; p.shift())
    --r;
  return p[0] ? (t.d = p, t.e = Te(p, r), Z ? q(t, h, D) : t) : new g(D === 3 ? -0 : 0);
};
S.modulo = S.mod = function(t) {
  var e, r = this, u = r.constructor;
  return t = new u(t), !r.d || !t.s || t.d && !t.d[0] ? new u(NaN) : !t.d || r.d && !r.d[0] ? q(new u(r), u.precision, u.rounding) : (Z = !1, u.modulo == 9 ? (e = X(r, t.abs(), 0, 3, 1), e.s *= t.s) : e = X(r, t, 0, u.modulo, 1), e = e.times(t), Z = !0, r.minus(e));
};
S.naturalExponential = S.exp = function() {
  return Ke(this);
};
S.naturalLogarithm = S.ln = function() {
  return zt(this);
};
S.negated = S.neg = function() {
  var t = new this.constructor(this);
  return t.s = -t.s, q(t);
};
S.plus = S.add = function(t) {
  var e, r, u, n, i, s, h, D, p, a, o = this, f = o.constructor;
  if (t = new f(t), !o.d || !t.d)
    return !o.s || !t.s ? t = new f(NaN) : o.d || (t = new f(t.d || o.s === t.s ? o : NaN)), t;
  if (o.s != t.s)
    return t.s = -t.s, o.minus(t);
  if (p = o.d, a = t.d, h = f.precision, D = f.rounding, !p[0] || !a[0])
    return a[0] || (t = new f(o)), Z ? q(t, h, D) : t;
  if (i = Dt(o.e / j), u = Dt(t.e / j), p = p.slice(), n = i - u, n) {
    for (n < 0 ? (r = p, n = -n, s = a.length) : (r = a, u = i, s = p.length), i = Math.ceil(h / j), s = i > s ? i + 1 : s + 1, n > s && (n = s, r.length = 1), r.reverse(); n--; )
      r.push(0);
    r.reverse();
  }
  for (s = p.length, n = a.length, s - n < 0 && (n = s, r = a, a = p, p = r), e = 0; n; )
    e = (p[--n] = p[n] + a[n] + e) / St | 0, p[n] %= St;
  for (e && (p.unshift(e), ++u), s = p.length; p[--s] == 0; )
    p.pop();
  return t.d = p, t.e = Te(p, u), Z ? q(t, h, D) : t;
};
S.precision = S.sd = function(t) {
  var e, r = this;
  if (t !== void 0 && t !== !!t && t !== 1 && t !== 0)
    throw Error(qt + t);
  return r.d ? (e = an(r.d), t && r.e + 1 > e && (e = r.e + 1)) : e = NaN, e;
};
S.round = function() {
  var t = this, e = t.constructor;
  return q(new e(t), t.e + 1, e.rounding);
};
S.sine = S.sin = function() {
  var t, e, r = this, u = r.constructor;
  return r.isFinite() ? r.isZero() ? new u(r) : (t = u.precision, e = u.rounding, u.precision = t + Math.max(r.e, r.sd()) + j, u.rounding = 1, r = Mi(u, ln(u, r)), u.precision = t, u.rounding = e, q(kt > 2 ? r.neg() : r, t, e, !0)) : new u(NaN);
};
S.squareRoot = S.sqrt = function() {
  var t, e, r, u, n, i, s = this, h = s.d, D = s.e, p = s.s, a = s.constructor;
  if (p !== 1 || !h || !h[0])
    return new a(!p || p < 0 && (!h || h[0]) ? NaN : h ? s : 1 / 0);
  for (Z = !1, p = Math.sqrt(+s), p == 0 || p == 1 / 0 ? (e = ct(h), (e.length + D) % 2 == 0 && (e += "0"), p = Math.sqrt(e), D = Dt((D + 1) / 2) - (D < 0 || D % 2), p == 1 / 0 ? e = "5e" + D : (e = p.toExponential(), e = e.slice(0, e.indexOf("e") + 1) + D), u = new a(e)) : u = new a(p.toString()), r = (D = a.precision) + 3; ; )
    if (i = u, u = i.plus(X(s, i, r + 2, 1)).times(0.5), ct(i.d).slice(0, r) === (e = ct(u.d)).slice(0, r))
      if (e = e.slice(r - 3, r + 1), e == "9999" || !n && e == "4999") {
        if (!n && (q(i, D + 1, 0), i.times(i).eq(s))) {
          u = i;
          break;
        }
        r += 4, n = 1;
      } else {
        (!+e || !+e.slice(1) && e.charAt(0) == "5") && (q(u, D + 1, 1), t = !u.times(u).eq(s));
        break;
      }
  return Z = !0, q(u, D, a.rounding, t);
};
S.tangent = S.tan = function() {
  var t, e, r = this, u = r.constructor;
  return r.isFinite() ? r.isZero() ? new u(r) : (t = u.precision, e = u.rounding, u.precision = t + 10, u.rounding = 1, r = r.sin(), r.s = 1, r = X(r, new u(1).minus(r.times(r)).sqrt(), t + 10, 0), u.precision = t, u.rounding = e, q(kt == 2 || kt == 4 ? r.neg() : r, t, e, !0)) : new u(NaN);
};
S.times = S.mul = function(t) {
  var e, r, u, n, i, s, h, D, p, a = this, o = a.constructor, f = a.d, l = (t = new o(t)).d;
  if (t.s *= a.s, !f || !f[0] || !l || !l[0])
    return new o(!t.s || f && !f[0] && !l || l && !l[0] && !f ? NaN : !f || !l ? t.s / 0 : t.s * 0);
  for (r = Dt(a.e / j) + Dt(t.e / j), D = f.length, p = l.length, D < p && (i = f, f = l, l = i, s = D, D = p, p = s), i = [], s = D + p, u = s; u--; )
    i.push(0);
  for (u = p; --u >= 0; ) {
    for (e = 0, n = D + u; n > u; )
      h = i[n] + l[u] * f[n - u - 1] + e, i[n--] = h % St | 0, e = h / St | 0;
    i[n] = (i[n] + e) % St | 0;
  }
  for (; !i[--s]; )
    i.pop();
  return e ? ++r : i.shift(), t.d = i, t.e = Te(i, r), Z ? q(t, o.precision, o.rounding) : t;
};
S.toBinary = function(t, e) {
  return rr(this, 2, t, e);
};
S.toDecimalPlaces = S.toDP = function(t, e) {
  var r = this, u = r.constructor;
  return r = new u(r), t === void 0 ? r : (At(t, 0, Ut), e === void 0 ? e = u.rounding : At(e, 0, 8), q(r, t + r.e + 1, e));
};
S.toExponential = function(t, e) {
  var r, u = this, n = u.constructor;
  return t === void 0 ? r = Ot(u, !0) : (At(t, 0, Ut), e === void 0 ? e = n.rounding : At(e, 0, 8), u = q(new n(u), t + 1, e), r = Ot(u, !0, t + 1)), u.isNeg() && !u.isZero() ? "-" + r : r;
};
S.toFixed = function(t, e) {
  var r, u, n = this, i = n.constructor;
  return t === void 0 ? r = Ot(n) : (At(t, 0, Ut), e === void 0 ? e = i.rounding : At(e, 0, 8), u = q(new i(n), t + n.e + 1, e), r = Ot(u, !1, t + u.e + 1)), n.isNeg() && !n.isZero() ? "-" + r : r;
};
S.toFraction = function(t) {
  var e, r, u, n, i, s, h, D, p, a, o, f, l = this, g = l.d, c = l.constructor;
  if (!g)
    return new c(l);
  if (p = r = new c(1), u = D = new c(0), e = new c(u), i = e.e = an(g) - l.e - 1, s = i % j, e.d[0] = nt(10, s < 0 ? j + s : s), t == null)
    t = i > 0 ? e : p;
  else {
    if (h = new c(t), !h.isInt() || h.lt(p))
      throw Error(qt + h);
    t = h.gt(e) ? i > 0 ? e : p : h;
  }
  for (Z = !1, h = new c(ct(g)), a = c.precision, c.precision = i = g.length * j * 2; o = X(h, e, 0, 1, 1), n = r.plus(o.times(u)), n.cmp(t) != 1; )
    r = u, u = n, n = p, p = D.plus(o.times(n)), D = n, n = e, e = h.minus(o.times(n)), h = n;
  return n = X(t.minus(r), u, 0, 1, 1), D = D.plus(n.times(p)), r = r.plus(n.times(u)), D.s = p.s = l.s, f = X(p, u, i, 1).minus(l).abs().cmp(X(D, r, i, 1).minus(l).abs()) < 1 ? [p, u] : [D, r], c.precision = a, Z = !0, f;
};
S.toHexadecimal = S.toHex = function(t, e) {
  return rr(this, 16, t, e);
};
S.toNearest = function(t, e) {
  var r = this, u = r.constructor;
  if (r = new u(r), t == null) {
    if (!r.d)
      return r;
    t = new u(1), e = u.rounding;
  } else {
    if (t = new u(t), e === void 0 ? e = u.rounding : At(e, 0, 8), !r.d)
      return t.s ? r : t;
    if (!t.d)
      return t.s && (t.s = r.s), t;
  }
  return t.d[0] ? (Z = !1, r = X(r, t, 0, e, 1).times(t), Z = !0, q(r)) : (t.s = r.s, r = t), r;
};
S.toNumber = function() {
  return +this;
};
S.toOctal = function(t, e) {
  return rr(this, 8, t, e);
};
S.toPower = S.pow = function(t) {
  var e, r, u, n, i, s, h = this, D = h.constructor, p = +(t = new D(t));
  if (!h.d || !t.d || !h.d[0] || !t.d[0])
    return new D(nt(+h, p));
  if (h = new D(h), h.eq(1))
    return h;
  if (u = D.precision, i = D.rounding, t.eq(1))
    return q(h, u, i);
  if (e = Dt(t.e / j), e >= t.d.length - 1 && (r = p < 0 ? -p : p) <= yi)
    return n = fn(D, h, r, u), t.s < 0 ? new D(1).div(n) : q(n, u, i);
  if (s = h.s, s < 0) {
    if (e < t.d.length - 1)
      return new D(NaN);
    if (t.d[e] & 1 || (s = 1), h.e == 0 && h.d[0] == 1 && h.d.length == 1)
      return h.s = s, h;
  }
  return r = nt(+h, p), e = r == 0 || !isFinite(r) ? Dt(p * (Math.log("0." + ct(h.d)) / Math.LN10 + h.e + 1)) : new D(r + "").e, e > D.maxE + 1 || e < D.minE - 1 ? new D(e > 0 ? s / 0 : 0) : (Z = !1, D.rounding = h.s = 1, r = Math.min(12, (e + "").length), n = Ke(t.times(zt(h, u + r)), u), n.d && (n = q(n, u + 5, 1), ae(n.d, u, i) && (e = u + 10, n = q(Ke(t.times(zt(h, e + r)), e), e + 5, 1), +ct(n.d).slice(u + 1, u + 15) + 1 == 1e14 && (n = q(n, u + 1, 0)))), n.s = s, Z = !0, D.rounding = i, q(n, u, i));
};
S.toPrecision = function(t, e) {
  var r, u = this, n = u.constructor;
  return t === void 0 ? r = Ot(u, u.e <= n.toExpNeg || u.e >= n.toExpPos) : (At(t, 1, Ut), e === void 0 ? e = n.rounding : At(e, 0, 8), u = q(new n(u), t, e), r = Ot(u, t <= u.e || u.e <= n.toExpNeg, t)), u.isNeg() && !u.isZero() ? "-" + r : r;
};
S.toSignificantDigits = S.toSD = function(t, e) {
  var r = this, u = r.constructor;
  return t === void 0 ? (t = u.precision, e = u.rounding) : (At(t, 1, Ut), e === void 0 ? e = u.rounding : At(e, 0, 8)), q(new u(r), t, e);
};
S.toString = function() {
  var t = this, e = t.constructor, r = Ot(t, t.e <= e.toExpNeg || t.e >= e.toExpPos);
  return t.isNeg() && !t.isZero() ? "-" + r : r;
};
S.truncated = S.trunc = function() {
  return q(new this.constructor(this), this.e + 1, 1);
};
S.valueOf = S.toJSON = function() {
  var t = this, e = t.constructor, r = Ot(t, t.e <= e.toExpNeg || t.e >= e.toExpPos);
  return t.isNeg() ? "-" + r : r;
};
function ct(t) {
  var e, r, u, n = t.length - 1, i = "", s = t[0];
  if (n > 0) {
    for (i += s, e = 1; e < n; e++)
      u = t[e] + "", r = j - u.length, r && (i += Rt(r)), i += u;
    s = t[e], u = s + "", r = j - u.length, r && (i += Rt(r));
  } else if (s === 0)
    return "0";
  for (; s % 10 === 0; )
    s /= 10;
  return i + s;
}
function At(t, e, r) {
  if (t !== ~~t || t < e || t > r)
    throw Error(qt + t);
}
function ae(t, e, r, u) {
  var n, i, s, h;
  for (i = t[0]; i >= 10; i /= 10)
    --e;
  return --e < 0 ? (e += j, n = 0) : (n = Math.ceil((e + 1) / j), e %= j), i = nt(10, j - e), h = t[n] % i | 0, u == null ? e < 3 ? (e == 0 ? h = h / 100 | 0 : e == 1 && (h = h / 10 | 0), s = r < 4 && h == 99999 || r > 3 && h == 49999 || h == 5e4 || h == 0) : s = (r < 4 && h + 1 == i || r > 3 && h + 1 == i / 2) && (t[n + 1] / i / 100 | 0) == nt(10, e - 2) - 1 || (h == i / 2 || h == 0) && (t[n + 1] / i / 100 | 0) == 0 : e < 4 ? (e == 0 ? h = h / 1e3 | 0 : e == 1 ? h = h / 100 | 0 : e == 2 && (h = h / 10 | 0), s = (u || r < 4) && h == 9999 || !u && r > 3 && h == 4999) : s = ((u || r < 4) && h + 1 == i || !u && r > 3 && h + 1 == i / 2) && (t[n + 1] / i / 1e3 | 0) == nt(10, e - 3) - 1, s;
}
function ve(t, e, r) {
  for (var u, n = [0], i, s = 0, h = t.length; s < h; ) {
    for (i = n.length; i--; )
      n[i] *= e;
    for (n[0] += Xe.indexOf(t.charAt(s++)), u = 0; u < n.length; u++)
      n[u] > r - 1 && (n[u + 1] === void 0 && (n[u + 1] = 0), n[u + 1] += n[u] / r | 0, n[u] %= r);
  }
  return n.reverse();
}
function Ni(t, e) {
  var r, u, n;
  if (e.isZero())
    return e;
  u = e.d.length, u < 32 ? (r = Math.ceil(u / 3), n = (1 / Oe(4, r)).toString()) : (r = 16, n = "2.3283064365386962890625e-10"), t.precision += r, e = Qt(t, 1, e.times(n), new t(1));
  for (var i = r; i--; ) {
    var s = e.times(e);
    e = s.times(s).minus(s).times(8).plus(1);
  }
  return t.precision -= r, e;
}
var X = /* @__PURE__ */ function() {
  function t(u, n, i) {
    var s, h = 0, D = u.length;
    for (u = u.slice(); D--; )
      s = u[D] * n + h, u[D] = s % i | 0, h = s / i | 0;
    return h && u.unshift(h), u;
  }
  function e(u, n, i, s) {
    var h, D;
    if (i != s)
      D = i > s ? 1 : -1;
    else
      for (h = D = 0; h < i; h++)
        if (u[h] != n[h]) {
          D = u[h] > n[h] ? 1 : -1;
          break;
        }
    return D;
  }
  function r(u, n, i, s) {
    for (var h = 0; i--; )
      u[i] -= h, h = u[i] < n[i] ? 1 : 0, u[i] = h * s + u[i] - n[i];
    for (; !u[0] && u.length > 1; )
      u.shift();
  }
  return function(u, n, i, s, h, D) {
    var p, a, o, f, l, g, c, v, d, F, E, w, N, B, M, C, _, z, k, L, U = u.constructor, W = u.s == n.s ? 1 : -1, Y = u.d, H = n.d;
    if (!Y || !Y[0] || !H || !H[0])
      return new U(
        // Return NaN if either NaN, or both Infinity or 0.
        !u.s || !n.s || (Y ? H && Y[0] == H[0] : !H) ? NaN : (
          // Return ±0 if x is 0 or y is ±Infinity, or return ±Infinity as y is 0.
          Y && Y[0] == 0 || !H ? W * 0 : W / 0
        )
      );
    for (D ? (l = 1, a = u.e - n.e) : (D = St, l = j, a = Dt(u.e / l) - Dt(n.e / l)), k = H.length, _ = Y.length, d = new U(W), F = d.d = [], o = 0; H[o] == (Y[o] || 0); o++)
      ;
    if (H[o] > (Y[o] || 0) && a--, i == null ? (B = i = U.precision, s = U.rounding) : h ? B = i + (u.e - n.e) + 1 : B = i, B < 0)
      F.push(1), g = !0;
    else {
      if (B = B / l + 2 | 0, o = 0, k == 1) {
        for (f = 0, H = H[0], B++; (o < _ || f) && B--; o++)
          M = f * D + (Y[o] || 0), F[o] = M / H | 0, f = M % H | 0;
        g = f || o < _;
      } else {
        for (f = D / (H[0] + 1) | 0, f > 1 && (H = t(H, f, D), Y = t(Y, f, D), k = H.length, _ = Y.length), C = k, E = Y.slice(0, k), w = E.length; w < k; )
          E[w++] = 0;
        L = H.slice(), L.unshift(0), z = H[0], H[1] >= D / 2 && ++z;
        do
          f = 0, p = e(H, E, k, w), p < 0 ? (N = E[0], k != w && (N = N * D + (E[1] || 0)), f = N / z | 0, f > 1 ? (f >= D && (f = D - 1), c = t(H, f, D), v = c.length, w = E.length, p = e(c, E, v, w), p == 1 && (f--, r(c, k < v ? L : H, v, D))) : (f == 0 && (p = f = 1), c = H.slice()), v = c.length, v < w && c.unshift(0), r(E, c, w, D), p == -1 && (w = E.length, p = e(H, E, k, w), p < 1 && (f++, r(E, k < w ? L : H, w, D))), w = E.length) : p === 0 && (f++, E = [0]), F[o++] = f, p && E[0] ? E[w++] = Y[C] || 0 : (E = [Y[C]], w = 1);
        while ((C++ < _ || E[0] !== void 0) && B--);
        g = E[0] !== void 0;
      }
      F[0] || F.shift();
    }
    if (l == 1)
      d.e = a, rn = g;
    else {
      for (o = 1, f = F[0]; f >= 10; f /= 10)
        o++;
      d.e = o + a * l - 1, q(d, h ? i + d.e + 1 : i, s, g);
    }
    return d;
  };
}();
function q(t, e, r, u) {
  var n, i, s, h, D, p, a, o, f, l = t.constructor;
  t:
    if (e != null) {
      if (o = t.d, !o)
        return t;
      for (n = 1, h = o[0]; h >= 10; h /= 10)
        n++;
      if (i = e - n, i < 0)
        i += j, s = e, a = o[f = 0], D = a / nt(10, n - s - 1) % 10 | 0;
      else if (f = Math.ceil((i + 1) / j), h = o.length, f >= h)
        if (u) {
          for (; h++ <= f; )
            o.push(0);
          a = D = 0, n = 1, i %= j, s = i - j + 1;
        } else
          break t;
      else {
        for (a = h = o[f], n = 1; h >= 10; h /= 10)
          n++;
        i %= j, s = i - j + n, D = s < 0 ? 0 : a / nt(10, n - s - 1) % 10 | 0;
      }
      if (u = u || e < 0 || o[f + 1] !== void 0 || (s < 0 ? a : a % nt(10, n - s - 1)), p = r < 4 ? (D || u) && (r == 0 || r == (t.s < 0 ? 3 : 2)) : D > 5 || D == 5 && (r == 4 || u || r == 6 && // Check whether the digit to the left of the rounding digit is odd.
      (i > 0 ? s > 0 ? a / nt(10, n - s) : 0 : o[f - 1]) % 10 & 1 || r == (t.s < 0 ? 8 : 7)), e < 1 || !o[0])
        return o.length = 0, p ? (e -= t.e + 1, o[0] = nt(10, (j - e % j) % j), t.e = -e || 0) : o[0] = t.e = 0, t;
      if (i == 0 ? (o.length = f, h = 1, f--) : (o.length = f + 1, h = nt(10, j - i), o[f] = s > 0 ? (a / nt(10, n - s) % nt(10, s) | 0) * h : 0), p)
        for (; ; )
          if (f == 0) {
            for (i = 1, s = o[0]; s >= 10; s /= 10)
              i++;
            for (s = o[0] += h, h = 1; s >= 10; s /= 10)
              h++;
            i != h && (t.e++, o[0] == St && (o[0] = 1));
            break;
          } else {
            if (o[f] += h, o[f] != St)
              break;
            o[f--] = 0, h = 1;
          }
      for (i = o.length; o[--i] === 0; )
        o.pop();
    }
  return Z && (t.e > l.maxE ? (t.d = null, t.e = NaN) : t.e < l.minE && (t.e = 0, t.d = [0])), t;
}
function Ot(t, e, r) {
  if (!t.isFinite())
    return hn(t);
  var u, n = t.e, i = ct(t.d), s = i.length;
  return e ? (r && (u = r - s) > 0 ? i = i.charAt(0) + "." + i.slice(1) + Rt(u) : s > 1 && (i = i.charAt(0) + "." + i.slice(1)), i = i + (t.e < 0 ? "e" : "e+") + t.e) : n < 0 ? (i = "0." + Rt(-n - 1) + i, r && (u = r - s) > 0 && (i += Rt(u))) : n >= s ? (i += Rt(n + 1 - s), r && (u = r - n - 1) > 0 && (i = i + "." + Rt(u))) : ((u = n + 1) < s && (i = i.slice(0, u) + "." + i.slice(u)), r && (u = r - s) > 0 && (n + 1 === s && (i += "."), i += Rt(u))), i;
}
function Te(t, e) {
  var r = t[0];
  for (e *= j; r >= 10; r /= 10)
    e++;
  return e;
}
function Ne(t, e, r) {
  if (e > Bi)
    throw Z = !0, r && (t.precision = r), Error(nn);
  return q(new t(ye), e, 1, !0);
}
function bt(t, e, r) {
  if (e > Je)
    throw Error(nn);
  return q(new t(Be), e, r, !0);
}
function an(t) {
  var e = t.length - 1, r = e * j + 1;
  if (e = t[e], e) {
    for (; e % 10 == 0; e /= 10)
      r--;
    for (e = t[0]; e >= 10; e /= 10)
      r++;
  }
  return r;
}
function Rt(t) {
  for (var e = ""; t--; )
    e += "0";
  return e;
}
function fn(t, e, r, u) {
  var n, i = new t(1), s = Math.ceil(u / j + 4);
  for (Z = !1; ; ) {
    if (r % 2 && (i = i.times(e), br(i.d, s) && (n = !0)), r = Dt(r / 2), r === 0) {
      r = i.d.length - 1, n && i.d[r] === 0 && ++i.d[r];
      break;
    }
    e = e.times(e), br(e.d, s);
  }
  return Z = !0, i;
}
function Mr(t) {
  return t.d[t.d.length - 1] & 1;
}
function cn(t, e, r) {
  for (var u, n = new t(e[0]), i = 0; ++i < e.length; )
    if (u = new t(e[i]), u.s)
      n[r](u) && (n = u);
    else {
      n = u;
      break;
    }
  return n;
}
function Ke(t, e) {
  var r, u, n, i, s, h, D, p = 0, a = 0, o = 0, f = t.constructor, l = f.rounding, g = f.precision;
  if (!t.d || !t.d[0] || t.e > 17)
    return new f(t.d ? t.d[0] ? t.s < 0 ? 0 : 1 / 0 : 1 : t.s ? t.s < 0 ? 0 : t : NaN);
  for (e == null ? (Z = !1, D = g) : D = e, h = new f(0.03125); t.e > -2; )
    t = t.times(h), o += 5;
  for (u = Math.log(nt(2, o)) / Math.LN10 * 2 + 5 | 0, D += u, r = i = s = new f(1), f.precision = D; ; ) {
    if (i = q(i.times(t), D, 1), r = r.times(++a), h = s.plus(X(i, r, D, 1)), ct(h.d).slice(0, D) === ct(s.d).slice(0, D)) {
      for (n = o; n--; )
        s = q(s.times(s), D, 1);
      if (e == null)
        if (p < 3 && ae(s.d, D - u, l, p))
          f.precision = D += 10, r = i = h = new f(1), a = 0, p++;
        else
          return q(s, f.precision = g, l, Z = !0);
      else
        return f.precision = g, s;
    }
    s = h;
  }
}
function zt(t, e) {
  var r, u, n, i, s, h, D, p, a, o, f, l = 1, g = 10, c = t, v = c.d, d = c.constructor, F = d.rounding, E = d.precision;
  if (c.s < 0 || !v || !v[0] || !c.e && v[0] == 1 && v.length == 1)
    return new d(v && !v[0] ? -1 / 0 : c.s != 1 ? NaN : v ? 0 : c);
  if (e == null ? (Z = !1, a = E) : a = e, d.precision = a += g, r = ct(v), u = r.charAt(0), Math.abs(i = c.e) < 15e14) {
    for (; u < 7 && u != 1 || u == 1 && r.charAt(1) > 3; )
      c = c.times(t), r = ct(c.d), u = r.charAt(0), l++;
    i = c.e, u > 1 ? (c = new d("0." + r), i++) : c = new d(u + "." + r.slice(1));
  } else
    return p = Ne(d, a + 2, E).times(i + ""), c = zt(new d(u + "." + r.slice(1)), a - g).plus(p), d.precision = E, e == null ? q(c, E, F, Z = !0) : c;
  for (o = c, D = s = c = X(c.minus(1), c.plus(1), a, 1), f = q(c.times(c), a, 1), n = 3; ; ) {
    if (s = q(s.times(f), a, 1), p = D.plus(X(s, new d(n), a, 1)), ct(p.d).slice(0, a) === ct(D.d).slice(0, a))
      if (D = D.times(2), i !== 0 && (D = D.plus(Ne(d, a + 2, E).times(i + ""))), D = X(D, new d(l), a, 1), e == null)
        if (ae(D.d, a - g, F, h))
          d.precision = a += g, p = s = c = X(o.minus(1), o.plus(1), a, 1), f = q(c.times(c), a, 1), n = h = 1;
        else
          return q(D, d.precision = E, F, Z = !0);
      else
        return d.precision = E, D;
    D = p, n += 2;
  }
}
function hn(t) {
  return String(t.s * t.s / 0);
}
function Qe(t, e) {
  var r, u, n;
  for ((r = e.indexOf(".")) > -1 && (e = e.replace(".", "")), (u = e.search(/e/i)) > 0 ? (r < 0 && (r = u), r += +e.slice(u + 1), e = e.substring(0, u)) : r < 0 && (r = e.length), u = 0; e.charCodeAt(u) === 48; u++)
    ;
  for (n = e.length; e.charCodeAt(n - 1) === 48; --n)
    ;
  if (e = e.slice(u, n), e) {
    if (n -= u, t.e = r = r - u - 1, t.d = [], u = (r + 1) % j, r < 0 && (u += j), u < n) {
      for (u && t.d.push(+e.slice(0, u)), n -= j; u < n; )
        t.d.push(+e.slice(u, u += j));
      e = e.slice(u), u = j - e.length;
    } else
      u -= n;
    for (; u--; )
      e += "0";
    t.d.push(+e), Z && (t.e > t.constructor.maxE ? (t.d = null, t.e = NaN) : t.e < t.constructor.minE && (t.e = 0, t.d = [0]));
  } else
    t.e = 0, t.d = [0];
  return t;
}
function _i(t, e) {
  var r, u, n, i, s, h, D, p, a;
  if (e.indexOf("_") > -1) {
    if (e = e.replace(/(\d)_(?=\d)/g, "$1"), sn.test(e))
      return Qe(t, e);
  } else if (e === "Infinity" || e === "NaN")
    return +e || (t.s = NaN), t.e = NaN, t.d = null, t;
  if (wi.test(e))
    r = 16, e = e.toLowerCase();
  else if (Ai.test(e))
    r = 2;
  else if (Ci.test(e))
    r = 8;
  else
    throw Error(qt + e);
  for (i = e.search(/p/i), i > 0 ? (D = +e.slice(i + 1), e = e.substring(2, i)) : e = e.slice(2), i = e.indexOf("."), s = i >= 0, u = t.constructor, s && (e = e.replace(".", ""), h = e.length, i = h - i, n = fn(u, new u(r), i, i * 2)), p = ve(e, r, St), a = p.length - 1, i = a; p[i] === 0; --i)
    p.pop();
  return i < 0 ? new u(t.s * 0) : (t.e = Te(p, a), t.d = p, Z = !1, s && (t = X(t, n, h * 4)), D && (t = t.times(Math.abs(D) < 54 ? nt(2, D) : te.pow(2, D))), Z = !0, t);
}
function Mi(t, e) {
  var r, u = e.d.length;
  if (u < 3)
    return e.isZero() ? e : Qt(t, 2, e, e);
  r = 1.4 * Math.sqrt(u), r = r > 16 ? 16 : r | 0, e = e.times(1 / Oe(5, r)), e = Qt(t, 2, e, e);
  for (var n, i = new t(5), s = new t(16), h = new t(20); r--; )
    n = e.times(e), e = e.times(i.plus(n.times(s.times(n).minus(h))));
  return e;
}
function Qt(t, e, r, u, n) {
  var i, s, h, D, p = t.precision, a = Math.ceil(p / j);
  for (Z = !1, D = r.times(r), h = new t(u); ; ) {
    if (s = X(h.times(D), new t(e++ * e++), p, 1), h = n ? u.plus(s) : u.minus(s), u = X(s.times(D), new t(e++ * e++), p, 1), s = h.plus(u), s.d[a] !== void 0) {
      for (i = a; s.d[i] === h.d[i] && i--; )
        ;
      if (i == -1)
        break;
    }
    i = h, h = u, u = s, s = i;
  }
  return Z = !0, s.d.length = a + 1, s;
}
function Oe(t, e) {
  for (var r = t; --e; )
    r *= t;
  return r;
}
function ln(t, e) {
  var r, u = e.s < 0, n = bt(t, t.precision, 1), i = n.times(0.5);
  if (e = e.abs(), e.lte(i))
    return kt = u ? 4 : 1, e;
  if (r = e.divToInt(n), r.isZero())
    kt = u ? 3 : 2;
  else {
    if (e = e.minus(r.times(n)), e.lte(i))
      return kt = Mr(r) ? u ? 2 : 3 : u ? 4 : 1, e;
    kt = Mr(r) ? u ? 1 : 4 : u ? 3 : 2;
  }
  return e.minus(n).abs();
}
function rr(t, e, r, u) {
  var n, i, s, h, D, p, a, o, f, l = t.constructor, g = r !== void 0;
  if (g ? (At(r, 1, Ut), u === void 0 ? u = l.rounding : At(u, 0, 8)) : (r = l.precision, u = l.rounding), !t.isFinite())
    a = hn(t);
  else {
    for (a = Ot(t), s = a.indexOf("."), g ? (n = 2, e == 16 ? r = r * 4 - 3 : e == 8 && (r = r * 3 - 2)) : n = e, s >= 0 && (a = a.replace(".", ""), f = new l(1), f.e = a.length - s, f.d = ve(Ot(f), 10, n), f.e = f.d.length), o = ve(a, 10, n), i = D = o.length; o[--D] == 0; )
      o.pop();
    if (!o[0])
      a = g ? "0p+0" : "0";
    else {
      if (s < 0 ? i-- : (t = new l(t), t.d = o, t.e = i, t = X(t, f, r, u, 0, n), o = t.d, i = t.e, p = rn), s = o[r], h = n / 2, p = p || o[r + 1] !== void 0, p = u < 4 ? (s !== void 0 || p) && (u === 0 || u === (t.s < 0 ? 3 : 2)) : s > h || s === h && (u === 4 || p || u === 6 && o[r - 1] & 1 || u === (t.s < 0 ? 8 : 7)), o.length = r, p)
        for (; ++o[--r] > n - 1; )
          o[r] = 0, r || (++i, o.unshift(1));
      for (D = o.length; !o[D - 1]; --D)
        ;
      for (s = 0, a = ""; s < D; s++)
        a += Xe.charAt(o[s]);
      if (g) {
        if (D > 1)
          if (e == 16 || e == 8) {
            for (s = e == 16 ? 4 : 3, --D; D % s; D++)
              a += "0";
            for (o = ve(a, n, e), D = o.length; !o[D - 1]; --D)
              ;
            for (s = 1, a = "1."; s < D; s++)
              a += Xe.charAt(o[s]);
          } else
            a = a.charAt(0) + "." + a.slice(1);
        a = a + (i < 0 ? "p" : "p+") + i;
      } else if (i < 0) {
        for (; ++i; )
          a = "0" + a;
        a = "0." + a;
      } else if (++i > D)
        for (i -= D; i--; )
          a += "0";
      else
        i < D && (a = a.slice(0, i) + "." + a.slice(i));
    }
    a = (e == 16 ? "0x" : e == 2 ? "0b" : e == 8 ? "0o" : "") + a;
  }
  return t.s < 0 ? "-" + a : a;
}
function br(t, e) {
  if (t.length > e)
    return t.length = e, !0;
}
function bi(t) {
  return new this(t).abs();
}
function Si(t) {
  return new this(t).acos();
}
function Ii(t) {
  return new this(t).acosh();
}
function Ti(t, e) {
  return new this(t).plus(e);
}
function Oi(t) {
  return new this(t).asin();
}
function Pi(t) {
  return new this(t).asinh();
}
function xi(t) {
  return new this(t).atan();
}
function ki(t) {
  return new this(t).atanh();
}
function Ri(t, e) {
  t = new this(t), e = new this(e);
  var r, u = this.precision, n = this.rounding, i = u + 4;
  return !t.s || !e.s ? r = new this(NaN) : !t.d && !e.d ? (r = bt(this, i, 1).times(e.s > 0 ? 0.25 : 0.75), r.s = t.s) : !e.d || t.isZero() ? (r = e.s < 0 ? bt(this, u, n) : new this(0), r.s = t.s) : !t.d || e.isZero() ? (r = bt(this, i, 1).times(0.5), r.s = t.s) : e.s < 0 ? (this.precision = i, this.rounding = 1, r = this.atan(X(t, e, i, 1)), e = bt(this, i, 1), this.precision = u, this.rounding = n, r = t.s < 0 ? r.minus(e) : r.plus(e)) : r = this.atan(X(t, e, i, 1)), r;
}
function zi(t) {
  return new this(t).cbrt();
}
function Li(t) {
  return q(t = new this(t), t.e + 1, 2);
}
function qi(t, e, r) {
  return new this(t).clamp(e, r);
}
function Ui(t) {
  if (!t || typeof t != "object")
    throw Error(Ie + "Object expected");
  var e, r, u, n = t.defaults === !0, i = [
    "precision",
    1,
    Ut,
    "rounding",
    0,
    8,
    "toExpNeg",
    -Jt,
    0,
    "toExpPos",
    0,
    Jt,
    "maxE",
    0,
    Jt,
    "minE",
    -Jt,
    0,
    "modulo",
    0,
    9
  ];
  for (e = 0; e < i.length; e += 3)
    if (r = i[e], n && (this[r] = Ge[r]), (u = t[r]) !== void 0)
      if (Dt(u) === u && u >= i[e + 1] && u <= i[e + 2])
        this[r] = u;
      else
        throw Error(qt + r + ": " + u);
  if (r = "crypto", n && (this[r] = Ge[r]), (u = t[r]) !== void 0)
    if (u === !0 || u === !1 || u === 0 || u === 1)
      if (u)
        if (typeof crypto < "u" && crypto && (crypto.getRandomValues || crypto.randomBytes))
          this[r] = !0;
        else
          throw Error(un);
      else
        this[r] = !1;
    else
      throw Error(qt + r + ": " + u);
  return this;
}
function $i(t) {
  return new this(t).cos();
}
function ji(t) {
  return new this(t).cosh();
}
function Dn(t) {
  var e, r, u;
  function n(i) {
    var s, h, D, p = this;
    if (!(p instanceof n))
      return new n(i);
    if (p.constructor = n, Sr(i)) {
      p.s = i.s, Z ? !i.d || i.e > n.maxE ? (p.e = NaN, p.d = null) : i.e < n.minE ? (p.e = 0, p.d = [0]) : (p.e = i.e, p.d = i.d.slice()) : (p.e = i.e, p.d = i.d ? i.d.slice() : i.d);
      return;
    }
    if (D = typeof i, D === "number") {
      if (i === 0) {
        p.s = 1 / i < 0 ? -1 : 1, p.e = 0, p.d = [0];
        return;
      }
      if (i < 0 ? (i = -i, p.s = -1) : p.s = 1, i === ~~i && i < 1e7) {
        for (s = 0, h = i; h >= 10; h /= 10)
          s++;
        Z ? s > n.maxE ? (p.e = NaN, p.d = null) : s < n.minE ? (p.e = 0, p.d = [0]) : (p.e = s, p.d = [i]) : (p.e = s, p.d = [i]);
        return;
      } else if (i * 0 !== 0) {
        i || (p.s = NaN), p.e = NaN, p.d = null;
        return;
      }
      return Qe(p, i.toString());
    } else if (D !== "string")
      throw Error(qt + i);
    return (h = i.charCodeAt(0)) === 45 ? (i = i.slice(1), p.s = -1) : (h === 43 && (i = i.slice(1)), p.s = 1), sn.test(i) ? Qe(p, i) : _i(p, i);
  }
  if (n.prototype = S, n.ROUND_UP = 0, n.ROUND_DOWN = 1, n.ROUND_CEIL = 2, n.ROUND_FLOOR = 3, n.ROUND_HALF_UP = 4, n.ROUND_HALF_DOWN = 5, n.ROUND_HALF_EVEN = 6, n.ROUND_HALF_CEIL = 7, n.ROUND_HALF_FLOOR = 8, n.EUCLID = 9, n.config = n.set = Ui, n.clone = Dn, n.isDecimal = Sr, n.abs = bi, n.acos = Si, n.acosh = Ii, n.add = Ti, n.asin = Oi, n.asinh = Pi, n.atan = xi, n.atanh = ki, n.atan2 = Ri, n.cbrt = zi, n.ceil = Li, n.clamp = qi, n.cos = $i, n.cosh = ji, n.div = Hi, n.exp = Zi, n.floor = Vi, n.hypot = Wi, n.ln = Yi, n.log = Xi, n.log10 = Ji, n.log2 = Gi, n.max = Ki, n.min = Qi, n.mod = to, n.mul = eo, n.pow = ro, n.random = no, n.round = uo, n.sign = io, n.sin = oo, n.sinh = so, n.sqrt = ao, n.sub = fo, n.sum = co, n.tan = ho, n.tanh = lo, n.trunc = Do, t === void 0 && (t = {}), t && t.defaults !== !0)
    for (u = ["precision", "rounding", "toExpNeg", "toExpPos", "maxE", "minE", "modulo", "crypto"], e = 0; e < u.length; )
      t.hasOwnProperty(r = u[e++]) || (t[r] = this[r]);
  return n.config(t), n;
}
function Hi(t, e) {
  return new this(t).div(e);
}
function Zi(t) {
  return new this(t).exp();
}
function Vi(t) {
  return q(t = new this(t), t.e + 1, 3);
}
function Wi() {
  var t, e, r = new this(0);
  for (Z = !1, t = 0; t < arguments.length; )
    if (e = new this(arguments[t++]), e.d)
      r.d && (r = r.plus(e.times(e)));
    else {
      if (e.s)
        return Z = !0, new this(1 / 0);
      r = e;
    }
  return Z = !0, r.sqrt();
}
function Sr(t) {
  return t instanceof te || t && t.toStringTag === on || !1;
}
function Yi(t) {
  return new this(t).ln();
}
function Xi(t, e) {
  return new this(t).log(e);
}
function Gi(t) {
  return new this(t).log(2);
}
function Ji(t) {
  return new this(t).log(10);
}
function Ki() {
  return cn(this, arguments, "lt");
}
function Qi() {
  return cn(this, arguments, "gt");
}
function to(t, e) {
  return new this(t).mod(e);
}
function eo(t, e) {
  return new this(t).mul(e);
}
function ro(t, e) {
  return new this(t).pow(e);
}
function no(t) {
  var e, r, u, n, i = 0, s = new this(1), h = [];
  if (t === void 0 ? t = this.precision : At(t, 1, Ut), u = Math.ceil(t / j), this.crypto)
    if (crypto.getRandomValues)
      for (e = crypto.getRandomValues(new Uint32Array(u)); i < u; )
        n = e[i], n >= 429e7 ? e[i] = crypto.getRandomValues(new Uint32Array(1))[0] : h[i++] = n % 1e7;
    else if (crypto.randomBytes) {
      for (e = crypto.randomBytes(u *= 4); i < u; )
        n = e[i] + (e[i + 1] << 8) + (e[i + 2] << 16) + ((e[i + 3] & 127) << 24), n >= 214e7 ? crypto.randomBytes(4).copy(e, i) : (h.push(n % 1e7), i += 4);
      i = u / 4;
    } else
      throw Error(un);
  else
    for (; i < u; )
      h[i++] = Math.random() * 1e7 | 0;
  for (u = h[--i], t %= j, u && t && (n = nt(10, j - t), h[i] = (u / n | 0) * n); h[i] === 0; i--)
    h.pop();
  if (i < 0)
    r = 0, h = [0];
  else {
    for (r = -1; h[0] === 0; r -= j)
      h.shift();
    for (u = 1, n = h[0]; n >= 10; n /= 10)
      u++;
    u < j && (r -= j - u);
  }
  return s.e = r, s.d = h, s;
}
function uo(t) {
  return q(t = new this(t), t.e + 1, this.rounding);
}
function io(t) {
  return t = new this(t), t.d ? t.d[0] ? t.s : 0 * t.s : t.s || NaN;
}
function oo(t) {
  return new this(t).sin();
}
function so(t) {
  return new this(t).sinh();
}
function ao(t) {
  return new this(t).sqrt();
}
function fo(t, e) {
  return new this(t).sub(e);
}
function co() {
  var t = 0, e = arguments, r = new this(e[t]);
  for (Z = !1; r.s && ++t < e.length; )
    r = r.plus(e[t]);
  return Z = !0, q(r, this.precision, this.rounding);
}
function ho(t) {
  return new this(t).tan();
}
function lo(t) {
  return new this(t).tanh();
}
function Do(t) {
  return q(t = new this(t), t.e + 1, 1);
}
S[Symbol.for("nodejs.util.inspect.custom")] = S.toString;
S[Symbol.toStringTag] = "Decimal";
var te = S.constructor = Dn(Ge);
ye = new te(ye);
Be = new te(Be);
var po = "BigNumber", vo = ["?on", "config"], go = /* @__PURE__ */ wt(po, vo, (t) => {
  var {
    on: e,
    config: r
  } = t, u = te.clone({
    precision: r.precision,
    modulo: te.EUCLID
  });
  return u.prototype = Object.create(u.prototype), u.prototype.type = "BigNumber", u.prototype.isBigNumber = !0, u.prototype.toJSON = function() {
    return {
      mathjs: "BigNumber",
      value: this.toString()
    };
  }, u.fromJSON = function(n) {
    return new u(n.value);
  }, e && e("config", function(n, i) {
    n.precision !== i.precision && u.config({
      precision: n.precision
    });
  }), u;
}, {
  isClass: !0
}), pn = { exports: {} };
/**
 * @license Complex.js v2.1.1 12/05/2020
 *
 * Copyright (c) 2020, Robert Eisele (robert@xarg.org)
 * Dual licensed under the MIT or GPL Version 2 licenses.
 **/
(function(t, e) {
  (function(r) {
    var u = Math.cosh || function(o) {
      return Math.abs(o) < 1e-9 ? 1 - o : (Math.exp(o) + Math.exp(-o)) * 0.5;
    }, n = Math.sinh || function(o) {
      return Math.abs(o) < 1e-9 ? o : (Math.exp(o) - Math.exp(-o)) * 0.5;
    }, i = function(o) {
      var f = Math.PI / 4;
      if (-f > o || o > f)
        return Math.cos(o) - 1;
      var l = o * o;
      return l * (l * (l * (l * (l * (l * (l * (l / 20922789888e3 - 1 / 87178291200) + 1 / 479001600) - 1 / 3628800) + 1 / 40320) - 1 / 720) + 1 / 24) - 1 / 2);
    }, s = function(o, f) {
      var l = Math.abs(o), g = Math.abs(f);
      return l < 3e3 && g < 3e3 ? Math.sqrt(l * l + g * g) : (l < g ? (l = g, g = o / f) : g = f / o, l * Math.sqrt(1 + g * g));
    }, h = function() {
      throw SyntaxError("Invalid Param");
    };
    function D(o, f) {
      var l = Math.abs(o), g = Math.abs(f);
      return o === 0 ? Math.log(g) : f === 0 ? Math.log(l) : l < 3e3 && g < 3e3 ? Math.log(o * o + f * f) * 0.5 : (o = o / 2, f = f / 2, 0.5 * Math.log(o * o + f * f) + Math.LN2);
    }
    var p = function(o, f) {
      var l = { re: 0, im: 0 };
      if (o == null)
        l.re = l.im = 0;
      else if (f !== void 0)
        l.re = o, l.im = f;
      else
        switch (typeof o) {
          case "object":
            if ("im" in o && "re" in o)
              l.re = o.re, l.im = o.im;
            else if ("abs" in o && "arg" in o) {
              if (!Number.isFinite(o.abs) && Number.isFinite(o.arg))
                return a.INFINITY;
              l.re = o.abs * Math.cos(o.arg), l.im = o.abs * Math.sin(o.arg);
            } else if ("r" in o && "phi" in o) {
              if (!Number.isFinite(o.r) && Number.isFinite(o.phi))
                return a.INFINITY;
              l.re = o.r * Math.cos(o.phi), l.im = o.r * Math.sin(o.phi);
            } else
              o.length === 2 ? (l.re = o[0], l.im = o[1]) : h();
            break;
          case "string":
            l.im = /* void */
            l.re = 0;
            var g = o.match(/\d+\.?\d*e[+-]?\d+|\d+\.?\d*|\.\d+|./g), c = 1, v = 0;
            g === null && h();
            for (var d = 0; d < g.length; d++) {
              var F = g[d];
              F === " " || F === "	" || F === `
` || (F === "+" ? c++ : F === "-" ? v++ : F === "i" || F === "I" ? (c + v === 0 && h(), g[d + 1] !== " " && !isNaN(g[d + 1]) ? (l.im += parseFloat((v % 2 ? "-" : "") + g[d + 1]), d++) : l.im += parseFloat((v % 2 ? "-" : "") + "1"), c = v = 0) : ((c + v === 0 || isNaN(F)) && h(), g[d + 1] === "i" || g[d + 1] === "I" ? (l.im += parseFloat((v % 2 ? "-" : "") + F), d++) : l.re += parseFloat((v % 2 ? "-" : "") + F), c = v = 0));
            }
            c + v > 0 && h();
            break;
          case "number":
            l.im = 0, l.re = o;
            break;
          default:
            h();
        }
      return isNaN(l.re) || isNaN(l.im), l;
    };
    function a(o, f) {
      if (!(this instanceof a))
        return new a(o, f);
      var l = p(o, f);
      this.re = l.re, this.im = l.im;
    }
    a.prototype = {
      re: 0,
      im: 0,
      /**
       * Calculates the sign of a complex number, which is a normalized complex
       *
       * @returns {Complex}
       */
      sign: function() {
        var o = this.abs();
        return new a(
          this.re / o,
          this.im / o
        );
      },
      /**
       * Adds two complex numbers
       *
       * @returns {Complex}
       */
      add: function(o, f) {
        var l = new a(o, f);
        return this.isInfinite() && l.isInfinite() ? a.NAN : this.isInfinite() || l.isInfinite() ? a.INFINITY : new a(
          this.re + l.re,
          this.im + l.im
        );
      },
      /**
       * Subtracts two complex numbers
       *
       * @returns {Complex}
       */
      sub: function(o, f) {
        var l = new a(o, f);
        return this.isInfinite() && l.isInfinite() ? a.NAN : this.isInfinite() || l.isInfinite() ? a.INFINITY : new a(
          this.re - l.re,
          this.im - l.im
        );
      },
      /**
       * Multiplies two complex numbers
       *
       * @returns {Complex}
       */
      mul: function(o, f) {
        var l = new a(o, f);
        return this.isInfinite() && l.isZero() || this.isZero() && l.isInfinite() ? a.NAN : this.isInfinite() || l.isInfinite() ? a.INFINITY : l.im === 0 && this.im === 0 ? new a(this.re * l.re, 0) : new a(
          this.re * l.re - this.im * l.im,
          this.re * l.im + this.im * l.re
        );
      },
      /**
       * Divides two complex numbers
       *
       * @returns {Complex}
       */
      div: function(o, f) {
        var l = new a(o, f);
        if (this.isZero() && l.isZero() || this.isInfinite() && l.isInfinite())
          return a.NAN;
        if (this.isInfinite() || l.isZero())
          return a.INFINITY;
        if (this.isZero() || l.isInfinite())
          return a.ZERO;
        o = this.re, f = this.im;
        var g = l.re, c = l.im, v, d;
        return c === 0 ? new a(o / g, f / g) : Math.abs(g) < Math.abs(c) ? (d = g / c, v = g * d + c, new a(
          (o * d + f) / v,
          (f * d - o) / v
        )) : (d = c / g, v = c * d + g, new a(
          (o + f * d) / v,
          (f - o * d) / v
        ));
      },
      /**
       * Calculate the power of two complex numbers
       *
       * @returns {Complex}
       */
      pow: function(o, f) {
        var l = new a(o, f);
        if (o = this.re, f = this.im, l.isZero())
          return a.ONE;
        if (l.im === 0) {
          if (f === 0 && o > 0)
            return new a(Math.pow(o, l.re), 0);
          if (o === 0)
            switch ((l.re % 4 + 4) % 4) {
              case 0:
                return new a(Math.pow(f, l.re), 0);
              case 1:
                return new a(0, Math.pow(f, l.re));
              case 2:
                return new a(-Math.pow(f, l.re), 0);
              case 3:
                return new a(0, -Math.pow(f, l.re));
            }
        }
        if (o === 0 && f === 0 && l.re > 0 && l.im >= 0)
          return a.ZERO;
        var g = Math.atan2(f, o), c = D(o, f);
        return o = Math.exp(l.re * c - l.im * g), f = l.im * c + l.re * g, new a(
          o * Math.cos(f),
          o * Math.sin(f)
        );
      },
      /**
       * Calculate the complex square root
       *
       * @returns {Complex}
       */
      sqrt: function() {
        var o = this.re, f = this.im, l = this.abs(), g, c;
        if (o >= 0) {
          if (f === 0)
            return new a(Math.sqrt(o), 0);
          g = 0.5 * Math.sqrt(2 * (l + o));
        } else
          g = Math.abs(f) / Math.sqrt(2 * (l - o));
        return o <= 0 ? c = 0.5 * Math.sqrt(2 * (l - o)) : c = Math.abs(f) / Math.sqrt(2 * (l + o)), new a(g, f < 0 ? -c : c);
      },
      /**
       * Calculate the complex exponent
       *
       * @returns {Complex}
       */
      exp: function() {
        var o = Math.exp(this.re);
        return this.im, new a(
          o * Math.cos(this.im),
          o * Math.sin(this.im)
        );
      },
      /**
       * Calculate the complex exponent and subtracts one.
       *
       * This may be more accurate than `Complex(x).exp().sub(1)` if
       * `x` is small.
       *
       * @returns {Complex}
       */
      expm1: function() {
        var o = this.re, f = this.im;
        return new a(
          Math.expm1(o) * Math.cos(f) + i(f),
          Math.exp(o) * Math.sin(f)
        );
      },
      /**
       * Calculate the natural log
       *
       * @returns {Complex}
       */
      log: function() {
        var o = this.re, f = this.im;
        return new a(
          D(o, f),
          Math.atan2(f, o)
        );
      },
      /**
       * Calculate the magnitude of the complex number
       *
       * @returns {number}
       */
      abs: function() {
        return s(this.re, this.im);
      },
      /**
       * Calculate the angle of the complex number
       *
       * @returns {number}
       */
      arg: function() {
        return Math.atan2(this.im, this.re);
      },
      /**
       * Calculate the sine of the complex number
       *
       * @returns {Complex}
       */
      sin: function() {
        var o = this.re, f = this.im;
        return new a(
          Math.sin(o) * u(f),
          Math.cos(o) * n(f)
        );
      },
      /**
       * Calculate the cosine
       *
       * @returns {Complex}
       */
      cos: function() {
        var o = this.re, f = this.im;
        return new a(
          Math.cos(o) * u(f),
          -Math.sin(o) * n(f)
        );
      },
      /**
       * Calculate the tangent
       *
       * @returns {Complex}
       */
      tan: function() {
        var o = 2 * this.re, f = 2 * this.im, l = Math.cos(o) + u(f);
        return new a(
          Math.sin(o) / l,
          n(f) / l
        );
      },
      /**
       * Calculate the cotangent
       *
       * @returns {Complex}
       */
      cot: function() {
        var o = 2 * this.re, f = 2 * this.im, l = Math.cos(o) - u(f);
        return new a(
          -Math.sin(o) / l,
          n(f) / l
        );
      },
      /**
       * Calculate the secant
       *
       * @returns {Complex}
       */
      sec: function() {
        var o = this.re, f = this.im, l = 0.5 * u(2 * f) + 0.5 * Math.cos(2 * o);
        return new a(
          Math.cos(o) * u(f) / l,
          Math.sin(o) * n(f) / l
        );
      },
      /**
       * Calculate the cosecans
       *
       * @returns {Complex}
       */
      csc: function() {
        var o = this.re, f = this.im, l = 0.5 * u(2 * f) - 0.5 * Math.cos(2 * o);
        return new a(
          Math.sin(o) * u(f) / l,
          -Math.cos(o) * n(f) / l
        );
      },
      /**
       * Calculate the complex arcus sinus
       *
       * @returns {Complex}
       */
      asin: function() {
        var o = this.re, f = this.im, l = new a(
          f * f - o * o + 1,
          -2 * o * f
        ).sqrt(), g = new a(
          l.re - f,
          l.im + o
        ).log();
        return new a(g.im, -g.re);
      },
      /**
       * Calculate the complex arcus cosinus
       *
       * @returns {Complex}
       */
      acos: function() {
        var o = this.re, f = this.im, l = new a(
          f * f - o * o + 1,
          -2 * o * f
        ).sqrt(), g = new a(
          l.re - f,
          l.im + o
        ).log();
        return new a(Math.PI / 2 - g.im, g.re);
      },
      /**
       * Calculate the complex arcus tangent
       *
       * @returns {Complex}
       */
      atan: function() {
        var o = this.re, f = this.im;
        if (o === 0) {
          if (f === 1)
            return new a(0, 1 / 0);
          if (f === -1)
            return new a(0, -1 / 0);
        }
        var l = o * o + (1 - f) * (1 - f), g = new a(
          (1 - f * f - o * o) / l,
          -2 * o / l
        ).log();
        return new a(-0.5 * g.im, 0.5 * g.re);
      },
      /**
       * Calculate the complex arcus cotangent
       *
       * @returns {Complex}
       */
      acot: function() {
        var o = this.re, f = this.im;
        if (f === 0)
          return new a(Math.atan2(1, o), 0);
        var l = o * o + f * f;
        return l !== 0 ? new a(
          o / l,
          -f / l
        ).atan() : new a(
          o !== 0 ? o / 0 : 0,
          f !== 0 ? -f / 0 : 0
        ).atan();
      },
      /**
       * Calculate the complex arcus secant
       *
       * @returns {Complex}
       */
      asec: function() {
        var o = this.re, f = this.im;
        if (o === 0 && f === 0)
          return new a(0, 1 / 0);
        var l = o * o + f * f;
        return l !== 0 ? new a(
          o / l,
          -f / l
        ).acos() : new a(
          o !== 0 ? o / 0 : 0,
          f !== 0 ? -f / 0 : 0
        ).acos();
      },
      /**
       * Calculate the complex arcus cosecans
       *
       * @returns {Complex}
       */
      acsc: function() {
        var o = this.re, f = this.im;
        if (o === 0 && f === 0)
          return new a(Math.PI / 2, 1 / 0);
        var l = o * o + f * f;
        return l !== 0 ? new a(
          o / l,
          -f / l
        ).asin() : new a(
          o !== 0 ? o / 0 : 0,
          f !== 0 ? -f / 0 : 0
        ).asin();
      },
      /**
       * Calculate the complex sinh
       *
       * @returns {Complex}
       */
      sinh: function() {
        var o = this.re, f = this.im;
        return new a(
          n(o) * Math.cos(f),
          u(o) * Math.sin(f)
        );
      },
      /**
       * Calculate the complex cosh
       *
       * @returns {Complex}
       */
      cosh: function() {
        var o = this.re, f = this.im;
        return new a(
          u(o) * Math.cos(f),
          n(o) * Math.sin(f)
        );
      },
      /**
       * Calculate the complex tanh
       *
       * @returns {Complex}
       */
      tanh: function() {
        var o = 2 * this.re, f = 2 * this.im, l = u(o) + Math.cos(f);
        return new a(
          n(o) / l,
          Math.sin(f) / l
        );
      },
      /**
       * Calculate the complex coth
       *
       * @returns {Complex}
       */
      coth: function() {
        var o = 2 * this.re, f = 2 * this.im, l = u(o) - Math.cos(f);
        return new a(
          n(o) / l,
          -Math.sin(f) / l
        );
      },
      /**
       * Calculate the complex coth
       *
       * @returns {Complex}
       */
      csch: function() {
        var o = this.re, f = this.im, l = Math.cos(2 * f) - u(2 * o);
        return new a(
          -2 * n(o) * Math.cos(f) / l,
          2 * u(o) * Math.sin(f) / l
        );
      },
      /**
       * Calculate the complex sech
       *
       * @returns {Complex}
       */
      sech: function() {
        var o = this.re, f = this.im, l = Math.cos(2 * f) + u(2 * o);
        return new a(
          2 * u(o) * Math.cos(f) / l,
          -2 * n(o) * Math.sin(f) / l
        );
      },
      /**
       * Calculate the complex asinh
       *
       * @returns {Complex}
       */
      asinh: function() {
        var o = this.im;
        this.im = -this.re, this.re = o;
        var f = this.asin();
        return this.re = -this.im, this.im = o, o = f.re, f.re = -f.im, f.im = o, f;
      },
      /**
       * Calculate the complex acosh
       *
       * @returns {Complex}
       */
      acosh: function() {
        var o = this.acos();
        if (o.im <= 0) {
          var f = o.re;
          o.re = -o.im, o.im = f;
        } else {
          var f = o.im;
          o.im = -o.re, o.re = f;
        }
        return o;
      },
      /**
       * Calculate the complex atanh
       *
       * @returns {Complex}
       */
      atanh: function() {
        var o = this.re, f = this.im, l = o > 1 && f === 0, g = 1 - o, c = 1 + o, v = g * g + f * f, d = v !== 0 ? new a(
          (c * g - f * f) / v,
          (f * g + c * f) / v
        ) : new a(
          o !== -1 ? o / 0 : 0,
          f !== 0 ? f / 0 : 0
        ), F = d.re;
        return d.re = D(d.re, d.im) / 2, d.im = Math.atan2(d.im, F) / 2, l && (d.im = -d.im), d;
      },
      /**
       * Calculate the complex acoth
       *
       * @returns {Complex}
       */
      acoth: function() {
        var o = this.re, f = this.im;
        if (o === 0 && f === 0)
          return new a(0, Math.PI / 2);
        var l = o * o + f * f;
        return l !== 0 ? new a(
          o / l,
          -f / l
        ).atanh() : new a(
          o !== 0 ? o / 0 : 0,
          f !== 0 ? -f / 0 : 0
        ).atanh();
      },
      /**
       * Calculate the complex acsch
       *
       * @returns {Complex}
       */
      acsch: function() {
        var o = this.re, f = this.im;
        if (f === 0)
          return new a(
            o !== 0 ? Math.log(o + Math.sqrt(o * o + 1)) : 1 / 0,
            0
          );
        var l = o * o + f * f;
        return l !== 0 ? new a(
          o / l,
          -f / l
        ).asinh() : new a(
          o !== 0 ? o / 0 : 0,
          f !== 0 ? -f / 0 : 0
        ).asinh();
      },
      /**
       * Calculate the complex asech
       *
       * @returns {Complex}
       */
      asech: function() {
        var o = this.re, f = this.im;
        if (this.isZero())
          return a.INFINITY;
        var l = o * o + f * f;
        return l !== 0 ? new a(
          o / l,
          -f / l
        ).acosh() : new a(
          o !== 0 ? o / 0 : 0,
          f !== 0 ? -f / 0 : 0
        ).acosh();
      },
      /**
       * Calculate the complex inverse 1/z
       *
       * @returns {Complex}
       */
      inverse: function() {
        if (this.isZero())
          return a.INFINITY;
        if (this.isInfinite())
          return a.ZERO;
        var o = this.re, f = this.im, l = o * o + f * f;
        return new a(o / l, -f / l);
      },
      /**
       * Returns the complex conjugate
       *
       * @returns {Complex}
       */
      conjugate: function() {
        return new a(this.re, -this.im);
      },
      /**
       * Gets the negated complex number
       *
       * @returns {Complex}
       */
      neg: function() {
        return new a(-this.re, -this.im);
      },
      /**
       * Ceils the actual complex number
       *
       * @returns {Complex}
       */
      ceil: function(o) {
        return o = Math.pow(10, o || 0), new a(
          Math.ceil(this.re * o) / o,
          Math.ceil(this.im * o) / o
        );
      },
      /**
       * Floors the actual complex number
       *
       * @returns {Complex}
       */
      floor: function(o) {
        return o = Math.pow(10, o || 0), new a(
          Math.floor(this.re * o) / o,
          Math.floor(this.im * o) / o
        );
      },
      /**
       * Ceils the actual complex number
       *
       * @returns {Complex}
       */
      round: function(o) {
        return o = Math.pow(10, o || 0), new a(
          Math.round(this.re * o) / o,
          Math.round(this.im * o) / o
        );
      },
      /**
       * Compares two complex numbers
       *
       * **Note:** new Complex(Infinity).equals(Infinity) === false
       *
       * @returns {boolean}
       */
      equals: function(o, f) {
        var l = new a(o, f);
        return Math.abs(l.re - this.re) <= a.EPSILON && Math.abs(l.im - this.im) <= a.EPSILON;
      },
      /**
       * Clones the actual object
       *
       * @returns {Complex}
       */
      clone: function() {
        return new a(this.re, this.im);
      },
      /**
       * Gets a string of the actual complex number
       *
       * @returns {string}
       */
      toString: function() {
        var o = this.re, f = this.im, l = "";
        return this.isNaN() ? "NaN" : this.isInfinite() ? "Infinity" : (Math.abs(o) < a.EPSILON && (o = 0), Math.abs(f) < a.EPSILON && (f = 0), f === 0 ? l + o : (o !== 0 ? (l += o, l += " ", f < 0 ? (f = -f, l += "-") : l += "+", l += " ") : f < 0 && (f = -f, l += "-"), f !== 1 && (l += f), l + "i"));
      },
      /**
       * Returns the actual number as a vector
       *
       * @returns {Array}
       */
      toVector: function() {
        return [this.re, this.im];
      },
      /**
       * Returns the actual real value of the current object
       *
       * @returns {number|null}
       */
      valueOf: function() {
        return this.im === 0 ? this.re : null;
      },
      /**
       * Determines whether a complex number is not on the Riemann sphere.
       *
       * @returns {boolean}
       */
      isNaN: function() {
        return isNaN(this.re) || isNaN(this.im);
      },
      /**
       * Determines whether or not a complex number is at the zero pole of the
       * Riemann sphere.
       *
       * @returns {boolean}
       */
      isZero: function() {
        return this.im === 0 && this.re === 0;
      },
      /**
       * Determines whether a complex number is not at the infinity pole of the
       * Riemann sphere.
       *
       * @returns {boolean}
       */
      isFinite: function() {
        return isFinite(this.re) && isFinite(this.im);
      },
      /**
       * Determines whether or not a complex number is at the infinity pole of the
       * Riemann sphere.
       *
       * @returns {boolean}
       */
      isInfinite: function() {
        return !(this.isNaN() || this.isFinite());
      }
    }, a.ZERO = new a(0, 0), a.ONE = new a(1, 0), a.I = new a(0, 1), a.PI = new a(Math.PI, 0), a.E = new a(Math.E, 0), a.INFINITY = new a(1 / 0, 1 / 0), a.NAN = new a(NaN, NaN), a.EPSILON = 1e-15, Object.defineProperty(a, "__esModule", { value: !0 }), a.default = a, a.Complex = a, t.exports = a;
  })();
})(pn);
var mo = pn.exports;
const ft = /* @__PURE__ */ zr(mo);
var Eo = "Complex", Fo = [], Ao = /* @__PURE__ */ wt(Eo, Fo, () => (Object.defineProperty(ft, "name", {
  value: "Complex"
}), ft.prototype.constructor = ft, ft.prototype.type = "Complex", ft.prototype.isComplex = !0, ft.prototype.toJSON = function() {
  return {
    mathjs: "Complex",
    re: this.re,
    im: this.im
  };
}, ft.prototype.toPolar = function() {
  return {
    r: this.abs(),
    phi: this.arg()
  };
}, ft.prototype.format = function(t) {
  var e = "", r = this.im, u = this.re, n = Ze(this.re, t), i = Ze(this.im, t), s = tt(t) ? t : t ? t.precision : null;
  if (s !== null) {
    var h = Math.pow(10, -s);
    Math.abs(u / r) < h && (u = 0), Math.abs(r / u) < h && (r = 0);
  }
  return r === 0 ? e = n : u === 0 ? r === 1 ? e = "i" : r === -1 ? e = "-i" : e = i + "i" : r < 0 ? r === -1 ? e = n + " - i" : e = n + " - " + i.substring(1) + "i" : r === 1 ? e = n + " + i" : e = n + " + " + i + "i", e;
}, ft.fromPolar = function(t) {
  switch (arguments.length) {
    case 1: {
      var e = arguments[0];
      if (typeof e == "object")
        return ft(e);
      throw new TypeError("Input has to be an object with r and phi keys.");
    }
    case 2: {
      var r = arguments[0], u = arguments[1];
      if (tt(r)) {
        if (Zr(u) && u.hasBase("ANGLE") && (u = u.toNumber("rad")), tt(u))
          return new ft({
            r,
            phi: u
          });
        throw new TypeError("Phi is not a number nor an angle unit.");
      } else
        throw new TypeError("Radius r is not a number.");
    }
    default:
      throw new SyntaxError("Wrong number of arguments in function fromPolar");
  }
}, ft.prototype.valueOf = ft.prototype.toString, ft.fromJSON = function(t) {
  return new ft(t);
}, ft.compare = function(t, e) {
  return t.re > e.re ? 1 : t.re < e.re ? -1 : t.im > e.im ? 1 : t.im < e.im ? -1 : 0;
}, ft), {
  isClass: !0
}), dn = { exports: {} };
/**
 * @license Fraction.js v4.2.0 05/03/2022
 * https://www.xarg.org/2014/03/rational-numbers-in-javascript/
 *
 * Copyright (c) 2021, Robert Eisele (robert@xarg.org)
 * Dual licensed under the MIT or GPL Version 2 licenses.
 **/
(function(t, e) {
  (function(r) {
    var u = 2e3, n = {
      s: 1,
      n: 0,
      d: 1
    };
    function i(g, c) {
      if (isNaN(g = parseInt(g, 10)))
        throw l.InvalidParameter;
      return g * c;
    }
    function s(g, c) {
      if (c === 0)
        throw l.DivisionByZero;
      var v = Object.create(l.prototype);
      v.s = g < 0 ? -1 : 1, g = g < 0 ? -g : g;
      var d = f(g, c);
      return v.n = g / d, v.d = c / d, v;
    }
    function h(g) {
      for (var c = {}, v = g, d = 2, F = 4; F <= v; ) {
        for (; v % d === 0; )
          v /= d, c[d] = (c[d] || 0) + 1;
        F += 1 + 2 * d++;
      }
      return v !== g ? v > 1 && (c[v] = (c[v] || 0) + 1) : c[g] = (c[g] || 0) + 1, c;
    }
    var D = function(g, c) {
      var v = 0, d = 1, F = 1, E = 0, w = 0, N = 0, B = 1, M = 1, C = 0, _ = 1, z = 1, k = 1, L = 1e7, U;
      if (g != null)
        if (c !== void 0) {
          if (v = g, d = c, F = v * d, v % 1 !== 0 || d % 1 !== 0)
            throw l.NonIntegerParameter;
        } else
          switch (typeof g) {
            case "object": {
              if ("d" in g && "n" in g)
                v = g.n, d = g.d, "s" in g && (v *= g.s);
              else if (0 in g)
                v = g[0], 1 in g && (d = g[1]);
              else
                throw l.InvalidParameter;
              F = v * d;
              break;
            }
            case "number": {
              if (g < 0 && (F = g, g = -g), g % 1 === 0)
                v = g;
              else if (g > 0) {
                for (g >= 1 && (M = Math.pow(10, Math.floor(1 + Math.log(g) / Math.LN10)), g /= M); _ <= L && k <= L; )
                  if (U = (C + z) / (_ + k), g === U) {
                    _ + k <= L ? (v = C + z, d = _ + k) : k > _ ? (v = z, d = k) : (v = C, d = _);
                    break;
                  } else
                    g > U ? (C += z, _ += k) : (z += C, k += _), _ > L ? (v = z, d = k) : (v = C, d = _);
                v *= M;
              } else
                (isNaN(g) || isNaN(c)) && (d = v = NaN);
              break;
            }
            case "string": {
              if (_ = g.match(/\d+|./g), _ === null)
                throw l.InvalidParameter;
              if (_[C] === "-" ? (F = -1, C++) : _[C] === "+" && C++, _.length === C + 1 ? w = i(_[C++], F) : _[C + 1] === "." || _[C] === "." ? (_[C] !== "." && (E = i(_[C++], F)), C++, (C + 1 === _.length || _[C + 1] === "(" && _[C + 3] === ")" || _[C + 1] === "'" && _[C + 3] === "'") && (w = i(_[C], F), B = Math.pow(10, _[C].length), C++), (_[C] === "(" && _[C + 2] === ")" || _[C] === "'" && _[C + 2] === "'") && (N = i(_[C + 1], F), M = Math.pow(10, _[C + 1].length) - 1, C += 3)) : _[C + 1] === "/" || _[C + 1] === ":" ? (w = i(_[C], F), B = i(_[C + 2], 1), C += 3) : _[C + 3] === "/" && _[C + 1] === " " && (E = i(_[C], F), w = i(_[C + 2], F), B = i(_[C + 4], 1), C += 5), _.length <= C) {
                d = B * M, F = /* void */
                v = N + d * E + M * w;
                break;
              }
            }
            default:
              throw l.InvalidParameter;
          }
      if (d === 0)
        throw l.DivisionByZero;
      n.s = F < 0 ? -1 : 1, n.n = Math.abs(v), n.d = Math.abs(d);
    };
    function p(g, c, v) {
      for (var d = 1; c > 0; g = g * g % v, c >>= 1)
        c & 1 && (d = d * g % v);
      return d;
    }
    function a(g, c) {
      for (; c % 2 === 0; c /= 2)
        ;
      for (; c % 5 === 0; c /= 5)
        ;
      if (c === 1)
        return 0;
      for (var v = 10 % c, d = 1; v !== 1; d++)
        if (v = v * 10 % c, d > u)
          return 0;
      return d;
    }
    function o(g, c, v) {
      for (var d = 1, F = p(10, v, c), E = 0; E < 300; E++) {
        if (d === F)
          return E;
        d = d * 10 % c, F = F * 10 % c;
      }
      return 0;
    }
    function f(g, c) {
      if (!g)
        return c;
      if (!c)
        return g;
      for (; ; ) {
        if (g %= c, !g)
          return c;
        if (c %= g, !c)
          return g;
      }
    }
    function l(g, c) {
      if (D(g, c), this instanceof l)
        g = f(n.d, n.n), this.s = n.s, this.n = n.n / g, this.d = n.d / g;
      else
        return s(n.s * n.n, n.d);
    }
    l.DivisionByZero = new Error("Division by Zero"), l.InvalidParameter = new Error("Invalid argument"), l.NonIntegerParameter = new Error("Parameters must be integer"), l.prototype = {
      s: 1,
      n: 0,
      d: 1,
      /**
       * Calculates the absolute value
       *
       * Ex: new Fraction(-4).abs() => 4
       **/
      abs: function() {
        return s(this.n, this.d);
      },
      /**
       * Inverts the sign of the current fraction
       *
       * Ex: new Fraction(-4).neg() => 4
       **/
      neg: function() {
        return s(-this.s * this.n, this.d);
      },
      /**
       * Adds two rational numbers
       *
       * Ex: new Fraction({n: 2, d: 3}).add("14.9") => 467 / 30
       **/
      add: function(g, c) {
        return D(g, c), s(
          this.s * this.n * n.d + n.s * this.d * n.n,
          this.d * n.d
        );
      },
      /**
       * Subtracts two rational numbers
       *
       * Ex: new Fraction({n: 2, d: 3}).add("14.9") => -427 / 30
       **/
      sub: function(g, c) {
        return D(g, c), s(
          this.s * this.n * n.d - n.s * this.d * n.n,
          this.d * n.d
        );
      },
      /**
       * Multiplies two rational numbers
       *
       * Ex: new Fraction("-17.(345)").mul(3) => 5776 / 111
       **/
      mul: function(g, c) {
        return D(g, c), s(
          this.s * n.s * this.n * n.n,
          this.d * n.d
        );
      },
      /**
       * Divides two rational numbers
       *
       * Ex: new Fraction("-17.(345)").inverse().div(3)
       **/
      div: function(g, c) {
        return D(g, c), s(
          this.s * n.s * this.n * n.d,
          this.d * n.n
        );
      },
      /**
       * Clones the actual object
       *
       * Ex: new Fraction("-17.(345)").clone()
       **/
      clone: function() {
        return s(this.s * this.n, this.d);
      },
      /**
       * Calculates the modulo of two rational numbers - a more precise fmod
       *
       * Ex: new Fraction('4.(3)').mod([7, 8]) => (13/3) % (7/8) = (5/6)
       **/
      mod: function(g, c) {
        if (isNaN(this.n) || isNaN(this.d))
          return new l(NaN);
        if (g === void 0)
          return s(this.s * this.n % this.d, 1);
        if (D(g, c), n.n === 0 && this.d === 0)
          throw l.DivisionByZero;
        return s(
          this.s * (n.d * this.n) % (n.n * this.d),
          n.d * this.d
        );
      },
      /**
       * Calculates the fractional gcd of two rational numbers
       *
       * Ex: new Fraction(5,8).gcd(3,7) => 1/56
       */
      gcd: function(g, c) {
        return D(g, c), s(f(n.n, this.n) * f(n.d, this.d), n.d * this.d);
      },
      /**
       * Calculates the fractional lcm of two rational numbers
       *
       * Ex: new Fraction(5,8).lcm(3,7) => 15
       */
      lcm: function(g, c) {
        return D(g, c), n.n === 0 && this.n === 0 ? s(0, 1) : s(n.n * this.n, f(n.n, this.n) * f(n.d, this.d));
      },
      /**
       * Calculates the ceil of a rational number
       *
       * Ex: new Fraction('4.(3)').ceil() => (5 / 1)
       **/
      ceil: function(g) {
        return g = Math.pow(10, g || 0), isNaN(this.n) || isNaN(this.d) ? new l(NaN) : s(Math.ceil(g * this.s * this.n / this.d), g);
      },
      /**
       * Calculates the floor of a rational number
       *
       * Ex: new Fraction('4.(3)').floor() => (4 / 1)
       **/
      floor: function(g) {
        return g = Math.pow(10, g || 0), isNaN(this.n) || isNaN(this.d) ? new l(NaN) : s(Math.floor(g * this.s * this.n / this.d), g);
      },
      /**
       * Rounds a rational numbers
       *
       * Ex: new Fraction('4.(3)').round() => (4 / 1)
       **/
      round: function(g) {
        return g = Math.pow(10, g || 0), isNaN(this.n) || isNaN(this.d) ? new l(NaN) : s(Math.round(g * this.s * this.n / this.d), g);
      },
      /**
       * Gets the inverse of the fraction, means numerator and denominator are exchanged
       *
       * Ex: new Fraction([-3, 4]).inverse() => -4 / 3
       **/
      inverse: function() {
        return s(this.s * this.d, this.n);
      },
      /**
       * Calculates the fraction to some rational exponent, if possible
       *
       * Ex: new Fraction(-1,2).pow(-3) => -8
       */
      pow: function(g, c) {
        if (D(g, c), n.d === 1)
          return n.s < 0 ? s(Math.pow(this.s * this.d, n.n), Math.pow(this.n, n.n)) : s(Math.pow(this.s * this.n, n.n), Math.pow(this.d, n.n));
        if (this.s < 0)
          return null;
        var v = h(this.n), d = h(this.d), F = 1, E = 1;
        for (var w in v)
          if (w !== "1") {
            if (w === "0") {
              F = 0;
              break;
            }
            if (v[w] *= n.n, v[w] % n.d === 0)
              v[w] /= n.d;
            else
              return null;
            F *= Math.pow(w, v[w]);
          }
        for (var w in d)
          if (w !== "1") {
            if (d[w] *= n.n, d[w] % n.d === 0)
              d[w] /= n.d;
            else
              return null;
            E *= Math.pow(w, d[w]);
          }
        return n.s < 0 ? s(E, F) : s(F, E);
      },
      /**
       * Check if two rational numbers are the same
       *
       * Ex: new Fraction(19.6).equals([98, 5]);
       **/
      equals: function(g, c) {
        return D(g, c), this.s * this.n * n.d === n.s * n.n * this.d;
      },
      /**
       * Check if two rational numbers are the same
       *
       * Ex: new Fraction(19.6).equals([98, 5]);
       **/
      compare: function(g, c) {
        D(g, c);
        var v = this.s * this.n * n.d - n.s * n.n * this.d;
        return (0 < v) - (v < 0);
      },
      simplify: function(g) {
        if (isNaN(this.n) || isNaN(this.d))
          return this;
        g = g || 1e-3;
        for (var c = this.abs(), v = c.toContinued(), d = 1; d < v.length; d++) {
          for (var F = s(v[d - 1], 1), E = d - 2; E >= 0; E--)
            F = F.inverse().add(v[E]);
          if (F.sub(c).abs().valueOf() < g)
            return F.mul(this.s);
        }
        return this;
      },
      /**
       * Check if two rational numbers are divisible
       *
       * Ex: new Fraction(19.6).divisible(1.5);
       */
      divisible: function(g, c) {
        return D(g, c), !(!(n.n * this.d) || this.n * n.d % (n.n * this.d));
      },
      /**
       * Returns a decimal representation of the fraction
       *
       * Ex: new Fraction("100.'91823'").valueOf() => 100.91823918239183
       **/
      valueOf: function() {
        return this.s * this.n / this.d;
      },
      /**
       * Returns a string-fraction representation of a Fraction object
       *
       * Ex: new Fraction("1.'3'").toFraction(true) => "4 1/3"
       **/
      toFraction: function(g) {
        var c, v = "", d = this.n, F = this.d;
        return this.s < 0 && (v += "-"), F === 1 ? v += d : (g && (c = Math.floor(d / F)) > 0 && (v += c, v += " ", d %= F), v += d, v += "/", v += F), v;
      },
      /**
       * Returns a latex representation of a Fraction object
       *
       * Ex: new Fraction("1.'3'").toLatex() => "\frac{4}{3}"
       **/
      toLatex: function(g) {
        var c, v = "", d = this.n, F = this.d;
        return this.s < 0 && (v += "-"), F === 1 ? v += d : (g && (c = Math.floor(d / F)) > 0 && (v += c, d %= F), v += "\\frac{", v += d, v += "}{", v += F, v += "}"), v;
      },
      /**
       * Returns an array of continued fraction elements
       *
       * Ex: new Fraction("7/8").toContinued() => [0,1,7]
       */
      toContinued: function() {
        var g, c = this.n, v = this.d, d = [];
        if (isNaN(c) || isNaN(v))
          return d;
        do
          d.push(Math.floor(c / v)), g = c % v, c = v, v = g;
        while (c !== 1);
        return d;
      },
      /**
       * Creates a string representation of a fraction with all digits
       *
       * Ex: new Fraction("100.'91823'").toString() => "100.(91823)"
       **/
      toString: function(g) {
        var c = this.n, v = this.d;
        if (isNaN(c) || isNaN(v))
          return "NaN";
        g = g || 15;
        var d = a(c, v), F = o(c, v, d), E = this.s < 0 ? "-" : "";
        if (E += c / v | 0, c %= v, c *= 10, c && (E += "."), d) {
          for (var w = F; w--; )
            E += c / v | 0, c %= v, c *= 10;
          E += "(";
          for (var w = d; w--; )
            E += c / v | 0, c %= v, c *= 10;
          E += ")";
        } else
          for (var w = g; c && w--; )
            E += c / v | 0, c %= v, c *= 10;
        return E;
      }
    }, Object.defineProperty(l, "__esModule", { value: !0 }), l.default = l, l.Fraction = l, t.exports = l;
  })();
})(dn);
var wo = dn.exports;
const xt = /* @__PURE__ */ zr(wo);
var Co = "Fraction", yo = [], Bo = /* @__PURE__ */ wt(Co, yo, () => (Object.defineProperty(xt, "name", {
  value: "Fraction"
}), xt.prototype.constructor = xt, xt.prototype.type = "Fraction", xt.prototype.isFraction = !0, xt.prototype.toJSON = function() {
  return {
    mathjs: "Fraction",
    n: this.s * this.n,
    d: this.d
  };
}, xt.fromJSON = function(t) {
  return new xt(t);
}, xt), {
  isClass: !0
}), No = "Matrix", _o = [], Mo = /* @__PURE__ */ wt(No, _o, () => {
  function t() {
    if (!(this instanceof t))
      throw new SyntaxError("Constructor must be called with the new operator");
  }
  return t.prototype.type = "Matrix", t.prototype.isMatrix = !0, t.prototype.storage = function() {
    throw new Error("Cannot invoke storage on a Matrix interface");
  }, t.prototype.datatype = function() {
    throw new Error("Cannot invoke datatype on a Matrix interface");
  }, t.prototype.create = function(e, r) {
    throw new Error("Cannot invoke create on a Matrix interface");
  }, t.prototype.subset = function(e, r, u) {
    throw new Error("Cannot invoke subset on a Matrix interface");
  }, t.prototype.get = function(e) {
    throw new Error("Cannot invoke get on a Matrix interface");
  }, t.prototype.set = function(e, r, u) {
    throw new Error("Cannot invoke set on a Matrix interface");
  }, t.prototype.resize = function(e, r) {
    throw new Error("Cannot invoke resize on a Matrix interface");
  }, t.prototype.reshape = function(e, r) {
    throw new Error("Cannot invoke reshape on a Matrix interface");
  }, t.prototype.clone = function() {
    throw new Error("Cannot invoke clone on a Matrix interface");
  }, t.prototype.size = function() {
    throw new Error("Cannot invoke size on a Matrix interface");
  }, t.prototype.map = function(e, r) {
    throw new Error("Cannot invoke map on a Matrix interface");
  }, t.prototype.forEach = function(e) {
    throw new Error("Cannot invoke forEach on a Matrix interface");
  }, t.prototype[Symbol.iterator] = function() {
    throw new Error("Cannot iterate a Matrix interface");
  }, t.prototype.toArray = function() {
    throw new Error("Cannot invoke toArray on a Matrix interface");
  }, t.prototype.valueOf = function() {
    throw new Error("Cannot invoke valueOf on a Matrix interface");
  }, t.prototype.format = function(e) {
    throw new Error("Cannot invoke format on a Matrix interface");
  }, t.prototype.toString = function() {
    throw new Error("Cannot invoke toString on a Matrix interface");
  }, t;
}, {
  isClass: !0
});
function nr(t) {
  return Object.keys(t.signatures || {}).reduce(function(e, r) {
    var u = (r.match(/,/g) || []).length + 1;
    return Math.max(e, u);
  }, -1);
}
var bo = "DenseMatrix", So = ["Matrix"], Io = /* @__PURE__ */ wt(bo, So, (t) => {
  var {
    Matrix: e
  } = t;
  function r(a, o) {
    if (!(this instanceof r))
      throw new SyntaxError("Constructor must be called with the new operator");
    if (o && !Tt(o))
      throw new Error("Invalid datatype: " + o);
    if (Lt(a))
      a.type === "DenseMatrix" ? (this._data = lt(a._data), this._size = lt(a._size), this._datatype = o || a._datatype) : (this._data = a.toArray(), this._size = a.size(), this._datatype = o || a._datatype);
    else if (a && J(a.data) && J(a.size))
      this._data = a.data, this._size = a.size, _r(this._data, this._size), this._datatype = o || a.datatype;
    else if (J(a))
      this._data = p(a), this._size = we(this._data), _r(this._data, this._size), this._datatype = o;
    else {
      if (a)
        throw new TypeError("Unsupported type of data (" + se(a) + ")");
      this._data = [], this._size = [0], this._datatype = o;
    }
  }
  r.prototype = new e(), r.prototype.createDenseMatrix = function(a, o) {
    return new r(a, o);
  }, Object.defineProperty(r, "name", {
    value: "DenseMatrix"
  }), r.prototype.constructor = r, r.prototype.type = "DenseMatrix", r.prototype.isDenseMatrix = !0, r.prototype.getDataType = function() {
    return Ce(this._data, se);
  }, r.prototype.storage = function() {
    return "dense";
  }, r.prototype.datatype = function() {
    return this._datatype;
  }, r.prototype.create = function(a, o) {
    return new r(a, o);
  }, r.prototype.subset = function(a, o, f) {
    switch (arguments.length) {
      case 1:
        return u(this, a);
      case 2:
      case 3:
        return i(this, a, o, f);
      default:
        throw new SyntaxError("Wrong number of arguments");
    }
  }, r.prototype.get = function(a) {
    if (!J(a))
      throw new TypeError("Array expected");
    if (a.length !== this._size.length)
      throw new Q(a.length, this._size.length);
    for (var o = 0; o < a.length; o++)
      K(a[o], this._size[o]);
    for (var f = this._data, l = 0, g = a.length; l < g; l++) {
      var c = a[l];
      K(c, f.length), f = f[c];
    }
    return f;
  }, r.prototype.set = function(a, o, f) {
    if (!J(a))
      throw new TypeError("Array expected");
    if (a.length < this._size.length)
      throw new Q(a.length, this._size.length, "<");
    var l, g, c, v = a.map(function(F) {
      return F + 1;
    });
    D(this, v, f);
    var d = this._data;
    for (l = 0, g = a.length - 1; l < g; l++)
      c = a[l], K(c, d.length), d = d[c];
    return c = a[a.length - 1], K(c, d.length), d[c] = o, this;
  };
  function u(a, o) {
    if (!tr(o))
      throw new TypeError("Invalid index");
    var f = o.isScalar();
    if (f)
      return a.get(o.min());
    var l = o.size();
    if (l.length !== a._size.length)
      throw new Q(l.length, a._size.length);
    for (var g = o.min(), c = o.max(), v = 0, d = a._size.length; v < d; v++)
      K(g[v], a._size[v]), K(c[v], a._size[v]);
    return new r(n(a._data, o, l.length, 0), a._datatype);
  }
  function n(a, o, f, l) {
    var g = l === f - 1, c = o.dimension(l);
    return g ? c.map(function(v) {
      return K(v, a.length), a[v];
    }).valueOf() : c.map(function(v) {
      K(v, a.length);
      var d = a[v];
      return n(d, o, f, l + 1);
    }).valueOf();
  }
  function i(a, o, f, l) {
    if (!o || o.isIndex !== !0)
      throw new TypeError("Invalid index");
    var g = o.size(), c = o.isScalar(), v;
    if (Lt(f) ? (v = f.size(), f = f.valueOf()) : v = we(f), c) {
      if (v.length !== 0)
        throw new TypeError("Scalar expected");
      a.set(o.min(), f, l);
    } else {
      if (g.length < a._size.length)
        throw new Q(g.length, a._size.length, "<");
      if (v.length < g.length) {
        for (var d = 0, F = 0; g[d] === 1 && v[d] === 1; )
          d++;
        for (; g[d] === 1; )
          F++, d++;
        f = Jr(f, g.length, F, v);
      }
      if (!Ee(g, v))
        throw new Q(g, v, ">");
      var E = o.max().map(function(B) {
        return B + 1;
      });
      D(a, E, l);
      var w = g.length, N = 0;
      s(a._data, o, f, w, N);
    }
    return a;
  }
  function s(a, o, f, l, g) {
    var c = g === l - 1, v = o.dimension(g);
    c ? v.forEach(function(d, F) {
      K(d), a[d] = f[F[0]];
    }) : v.forEach(function(d, F) {
      K(d), s(a[d], o, f[F[0]], l, g + 1);
    });
  }
  r.prototype.resize = function(a, o, f) {
    if (!me(a))
      throw new TypeError("Array or Matrix expected");
    var l = a.valueOf().map((c) => Array.isArray(c) && c.length === 1 ? c[0] : c), g = f ? this.clone() : this;
    return h(g, l, o);
  };
  function h(a, o, f) {
    if (o.length === 0) {
      for (var l = a._data; J(l); )
        l = l[0];
      return l;
    }
    return a._size = o.slice(0), a._data = Ve(a._data, a._size, f), a;
  }
  r.prototype.reshape = function(a, o) {
    var f = o ? this.clone() : this;
    f._data = ii(f._data, a);
    var l = f._size.reduce((g, c) => g * c);
    return f._size = er(a, l), f;
  };
  function D(a, o, f) {
    for (var l = a._size.slice(0), g = !1; l.length < o.length; )
      l.push(0), g = !0;
    for (var c = 0, v = o.length; c < v; c++)
      o[c] > l[c] && (l[c] = o[c], g = !0);
    g && h(a, l, f);
  }
  r.prototype.clone = function() {
    var a = new r({
      data: lt(this._data),
      size: lt(this._size),
      datatype: this._datatype
    });
    return a;
  }, r.prototype.size = function() {
    return this._size.slice(0);
  }, r.prototype.map = function(a) {
    var o = this, f = nr(a), l = function v(d, F) {
      return J(d) ? d.map(function(E, w) {
        return v(E, F.concat(w));
      }) : f === 1 ? a(d) : f === 2 ? a(d, F) : a(d, F, o);
    }, g = l(this._data, []), c = this._datatype !== void 0 ? Ce(g, se) : void 0;
    return new r(g, c);
  }, r.prototype.forEach = function(a) {
    var o = this, f = function l(g, c) {
      J(g) ? g.forEach(function(v, d) {
        l(v, c.concat(d));
      }) : a(g, c, o);
    };
    f(this._data, []);
  }, r.prototype[Symbol.iterator] = function* () {
    var a = function* o(f, l) {
      if (J(f))
        for (var g = 0; g < f.length; g++)
          yield* o(f[g], l.concat(g));
      else
        yield {
          value: f,
          index: l
        };
    };
    yield* a(this._data, []);
  }, r.prototype.rows = function() {
    var a = [], o = this.size();
    if (o.length !== 2)
      throw new TypeError("Rows can only be returned for a 2D matrix.");
    var f = this._data;
    for (var l of f)
      a.push(new r([l], this._datatype));
    return a;
  }, r.prototype.columns = function() {
    var a = this, o = [], f = this.size();
    if (f.length !== 2)
      throw new TypeError("Rows can only be returned for a 2D matrix.");
    for (var l = this._data, g = function(d) {
      var F = l.map((E) => [E[d]]);
      o.push(new r(F, a._datatype));
    }, c = 0; c < f[1]; c++)
      g(c);
    return o;
  }, r.prototype.toArray = function() {
    return lt(this._data);
  }, r.prototype.valueOf = function() {
    return this._data;
  }, r.prototype.format = function(a) {
    return Ft(this._data, a);
  }, r.prototype.toString = function() {
    return Ft(this._data);
  }, r.prototype.toJSON = function() {
    return {
      mathjs: "DenseMatrix",
      data: this._data,
      size: this._size,
      datatype: this._datatype
    };
  }, r.prototype.diagonal = function(a) {
    if (a) {
      if (_t(a) && (a = a.toNumber()), !tt(a) || !it(a))
        throw new TypeError("The parameter k must be an integer number");
    } else
      a = 0;
    for (var o = a > 0 ? a : 0, f = a < 0 ? -a : 0, l = this._size[0], g = this._size[1], c = Math.min(l - f, g - o), v = [], d = 0; d < c; d++)
      v[d] = this._data[d + f][d + o];
    return new r({
      data: v,
      size: [c],
      datatype: this._datatype
    });
  }, r.diagonal = function(a, o, f, l) {
    if (!J(a))
      throw new TypeError("Array expected, size parameter");
    if (a.length !== 2)
      throw new Error("Only two dimensions matrix are supported");
    if (a = a.map(function(M) {
      if (_t(M) && (M = M.toNumber()), !tt(M) || !it(M) || M < 1)
        throw new Error("Size values must be positive integers");
      return M;
    }), f) {
      if (_t(f) && (f = f.toNumber()), !tt(f) || !it(f))
        throw new TypeError("The parameter k must be an integer number");
    } else
      f = 0;
    var g = f > 0 ? f : 0, c = f < 0 ? -f : 0, v = a[0], d = a[1], F = Math.min(v - c, d - g), E;
    if (J(o)) {
      if (o.length !== F)
        throw new Error("Invalid value array length");
      E = function(C) {
        return o[C];
      };
    } else if (Lt(o)) {
      var w = o.size();
      if (w.length !== 1 || w[0] !== F)
        throw new Error("Invalid matrix length");
      E = function(C) {
        return o.get([C]);
      };
    } else
      E = function() {
        return o;
      };
    l || (l = _t(E(0)) ? E(0).mul(0) : 0);
    var N = [];
    if (a.length > 0) {
      N = Ve(N, a, l);
      for (var B = 0; B < F; B++)
        N[B + c][B + g] = E(B);
    }
    return new r({
      data: N,
      size: [v, d]
    });
  }, r.fromJSON = function(a) {
    return new r(a);
  }, r.prototype.swapRows = function(a, o) {
    if (!tt(a) || !it(a) || !tt(o) || !it(o))
      throw new Error("Row index must be positive integers");
    if (this._size.length !== 2)
      throw new Error("Only two dimensional matrix is supported");
    return K(a, this._size[0]), K(o, this._size[0]), r._swapRows(a, o, this._data), this;
  }, r._swapRows = function(a, o, f) {
    var l = f[a];
    f[a] = f[o], f[o] = l;
  };
  function p(a) {
    for (var o = 0, f = a.length; o < f; o++) {
      var l = a[o];
      J(l) ? a[o] = p(l) : l && l.isMatrix === !0 && (a[o] = p(l.valueOf()));
    }
    return a;
  }
  return r;
}, {
  isClass: !0
});
function To(t, e, r) {
  if (r == null)
    return t.eq(e);
  if (t.eq(e))
    return !0;
  if (t.isNaN() || e.isNaN())
    return !1;
  if (t.isFinite() && e.isFinite()) {
    var u = t.minus(e).abs();
    if (u.isZero())
      return !0;
    var n = t.constructor.max(t.abs(), e.abs());
    return u.lte(n.times(r));
  }
  return !1;
}
function Oo(t, e, r) {
  return Ae(t.re, e.re, r) && Ae(t.im, e.im, r);
}
var Po = /* @__PURE__ */ wt("compareUnits", ["typed"], (t) => {
  var {
    typed: e
  } = t;
  return {
    "Unit, Unit": e.referToSelf((r) => (u, n) => {
      if (!u.equalBase(n))
        throw new Error("Cannot compare units with different base");
      return e.find(r, [u.valueType(), n.valueType()])(u.value, n.value);
    })
  };
}), _e = "equalScalar", xo = ["typed", "config"], ko = /* @__PURE__ */ wt(_e, xo, (t) => {
  var {
    typed: e,
    config: r
  } = t, u = Po({
    typed: e
  });
  return e(_e, {
    "boolean, boolean": function(i, s) {
      return i === s;
    },
    "number, number": function(i, s) {
      return Ae(i, s, r.epsilon);
    },
    "BigNumber, BigNumber": function(i, s) {
      return i.eq(s) || To(i, s, r.epsilon);
    },
    "Fraction, Fraction": function(i, s) {
      return i.equals(s);
    },
    "Complex, Complex": function(i, s) {
      return Oo(i, s, r.epsilon);
    }
  }, u);
});
wt(_e, ["typed", "config"], (t) => {
  var {
    typed: e,
    config: r
  } = t;
  return e(_e, {
    "number, number": function(n, i) {
      return Ae(n, i, r.epsilon);
    }
  });
});
var Ro = "SparseMatrix", zo = ["typed", "equalScalar", "Matrix"], Lo = /* @__PURE__ */ wt(Ro, zo, (t) => {
  var {
    typed: e,
    equalScalar: r,
    Matrix: u
  } = t;
  function n(c, v) {
    if (!(this instanceof n))
      throw new SyntaxError("Constructor must be called with the new operator");
    if (v && !Tt(v))
      throw new Error("Invalid datatype: " + v);
    if (Lt(c))
      i(this, c, v);
    else if (c && J(c.index) && J(c.ptr) && J(c.size))
      this._values = c.values, this._index = c.index, this._ptr = c.ptr, this._size = c.size, this._datatype = v || c.datatype;
    else if (J(c))
      s(this, c, v);
    else {
      if (c)
        throw new TypeError("Unsupported type of data (" + se(c) + ")");
      this._values = [], this._index = [], this._ptr = [0], this._size = [0, 0], this._datatype = v;
    }
  }
  function i(c, v, d) {
    v.type === "SparseMatrix" ? (c._values = v._values ? lt(v._values) : void 0, c._index = lt(v._index), c._ptr = lt(v._ptr), c._size = lt(v._size), c._datatype = d || v._datatype) : s(c, v.valueOf(), d || v._datatype);
  }
  function s(c, v, d) {
    c._values = [], c._index = [], c._ptr = [], c._datatype = d;
    var F = v.length, E = 0, w = r, N = 0;
    if (Tt(d) && (w = e.find(r, [d, d]) || r, N = e.convert(0, d)), F > 0) {
      var B = 0;
      do {
        c._ptr.push(c._index.length);
        for (var M = 0; M < F; M++) {
          var C = v[M];
          if (J(C)) {
            if (B === 0 && E < C.length && (E = C.length), B < C.length) {
              var _ = C[B];
              w(_, N) || (c._values.push(_), c._index.push(M));
            }
          } else
            B === 0 && E < 1 && (E = 1), w(C, N) || (c._values.push(C), c._index.push(M));
        }
        B++;
      } while (B < E);
    }
    c._ptr.push(c._index.length), c._size = [F, E];
  }
  n.prototype = new u(), n.prototype.createSparseMatrix = function(c, v) {
    return new n(c, v);
  }, Object.defineProperty(n, "name", {
    value: "SparseMatrix"
  }), n.prototype.constructor = n, n.prototype.type = "SparseMatrix", n.prototype.isSparseMatrix = !0, n.prototype.getDataType = function() {
    return Ce(this._values, se);
  }, n.prototype.storage = function() {
    return "sparse";
  }, n.prototype.datatype = function() {
    return this._datatype;
  }, n.prototype.create = function(c, v) {
    return new n(c, v);
  }, n.prototype.density = function() {
    var c = this._size[0], v = this._size[1];
    return c !== 0 && v !== 0 ? this._index.length / (c * v) : 0;
  }, n.prototype.subset = function(c, v, d) {
    if (!this._values)
      throw new Error("Cannot invoke subset on a Pattern only matrix");
    switch (arguments.length) {
      case 1:
        return h(this, c);
      case 2:
      case 3:
        return D(this, c, v, d);
      default:
        throw new SyntaxError("Wrong number of arguments");
    }
  };
  function h(c, v) {
    if (!tr(v))
      throw new TypeError("Invalid index");
    var d = v.isScalar();
    if (d)
      return c.get(v.min());
    var F = v.size();
    if (F.length !== c._size.length)
      throw new Q(F.length, c._size.length);
    var E, w, N, B, M = v.min(), C = v.max();
    for (E = 0, w = c._size.length; E < w; E++)
      K(M[E], c._size[E]), K(C[E], c._size[E]);
    var _ = c._values, z = c._index, k = c._ptr, L = v.dimension(0), U = v.dimension(1), W = [], Y = [];
    L.forEach(function(G, Ct) {
      Y[G] = Ct[0], W[G] = !0;
    });
    var H = _ ? [] : void 0, ot = [], pt = [];
    return U.forEach(function(G) {
      for (pt.push(ot.length), N = k[G], B = k[G + 1]; N < B; N++)
        E = z[N], W[E] === !0 && (ot.push(Y[E]), H && H.push(_[N]));
    }), pt.push(ot.length), new n({
      values: H,
      index: ot,
      ptr: pt,
      size: F,
      datatype: c._datatype
    });
  }
  function D(c, v, d, F) {
    if (!v || v.isIndex !== !0)
      throw new TypeError("Invalid index");
    var E = v.size(), w = v.isScalar(), N;
    if (Lt(d) ? (N = d.size(), d = d.toArray()) : N = we(d), w) {
      if (N.length !== 0)
        throw new TypeError("Scalar expected");
      c.set(v.min(), d, F);
    } else {
      if (E.length !== 1 && E.length !== 2)
        throw new Q(E.length, c._size.length, "<");
      if (N.length < E.length) {
        for (var B = 0, M = 0; E[B] === 1 && N[B] === 1; )
          B++;
        for (; E[B] === 1; )
          M++, B++;
        d = Jr(d, E.length, M, N);
      }
      if (!Ee(E, N))
        throw new Q(E, N, ">");
      if (E.length === 1) {
        var C = v.dimension(0);
        C.forEach(function(k, L) {
          K(k), c.set([k, 0], d[L[0]], F);
        });
      } else {
        var _ = v.dimension(0), z = v.dimension(1);
        _.forEach(function(k, L) {
          K(k), z.forEach(function(U, W) {
            K(U), c.set([k, U], d[L[0]][W[0]], F);
          });
        });
      }
    }
    return c;
  }
  n.prototype.get = function(c) {
    if (!J(c))
      throw new TypeError("Array expected");
    if (c.length !== this._size.length)
      throw new Q(c.length, this._size.length);
    if (!this._values)
      throw new Error("Cannot invoke get on a Pattern only matrix");
    var v = c[0], d = c[1];
    K(v, this._size[0]), K(d, this._size[1]);
    var F = p(v, this._ptr[d], this._ptr[d + 1], this._index);
    return F < this._ptr[d + 1] && this._index[F] === v ? this._values[F] : 0;
  }, n.prototype.set = function(c, v, d) {
    if (!J(c))
      throw new TypeError("Array expected");
    if (c.length !== this._size.length)
      throw new Q(c.length, this._size.length);
    if (!this._values)
      throw new Error("Cannot invoke set on a Pattern only matrix");
    var F = c[0], E = c[1], w = this._size[0], N = this._size[1], B = r, M = 0;
    Tt(this._datatype) && (B = e.find(r, [this._datatype, this._datatype]) || r, M = e.convert(0, this._datatype)), (F > w - 1 || E > N - 1) && (f(this, Math.max(F + 1, w), Math.max(E + 1, N), d), w = this._size[0], N = this._size[1]), K(F, w), K(E, N);
    var C = p(F, this._ptr[E], this._ptr[E + 1], this._index);
    return C < this._ptr[E + 1] && this._index[C] === F ? B(v, M) ? a(C, E, this._values, this._index, this._ptr) : this._values[C] = v : B(v, M) || o(C, F, E, v, this._values, this._index, this._ptr), this;
  };
  function p(c, v, d, F) {
    if (d - v === 0)
      return d;
    for (var E = v; E < d; E++)
      if (F[E] === c)
        return E;
    return v;
  }
  function a(c, v, d, F, E) {
    d.splice(c, 1), F.splice(c, 1);
    for (var w = v + 1; w < E.length; w++)
      E[w]--;
  }
  function o(c, v, d, F, E, w, N) {
    E.splice(c, 0, F), w.splice(c, 0, v);
    for (var B = d + 1; B < N.length; B++)
      N[B]++;
  }
  n.prototype.resize = function(c, v, d) {
    if (!me(c))
      throw new TypeError("Array or Matrix expected");
    var F = c.valueOf().map((w) => Array.isArray(w) && w.length === 1 ? w[0] : w);
    if (F.length !== 2)
      throw new Error("Only two dimensions matrix are supported");
    F.forEach(function(w) {
      if (!tt(w) || !it(w) || w < 0)
        throw new TypeError("Invalid size, must contain positive integers (size: " + Ft(F) + ")");
    });
    var E = d ? this.clone() : this;
    return f(E, F[0], F[1], v);
  };
  function f(c, v, d, F) {
    var E = F || 0, w = r, N = 0;
    Tt(c._datatype) && (w = e.find(r, [c._datatype, c._datatype]) || r, N = e.convert(0, c._datatype), E = e.convert(E, c._datatype));
    var B = !w(E, N), M = c._size[0], C = c._size[1], _, z, k;
    if (d > C) {
      for (z = C; z < d; z++)
        if (c._ptr[z] = c._values.length, B)
          for (_ = 0; _ < M; _++)
            c._values.push(E), c._index.push(_);
      c._ptr[d] = c._values.length;
    } else
      d < C && (c._ptr.splice(d + 1, C - d), c._values.splice(c._ptr[d], c._values.length), c._index.splice(c._ptr[d], c._index.length));
    if (C = d, v > M) {
      if (B) {
        var L = 0;
        for (z = 0; z < C; z++) {
          c._ptr[z] = c._ptr[z] + L, k = c._ptr[z + 1] + L;
          var U = 0;
          for (_ = M; _ < v; _++, U++)
            c._values.splice(k + U, 0, E), c._index.splice(k + U, 0, _), L++;
        }
        c._ptr[C] = c._values.length;
      }
    } else if (v < M) {
      var W = 0;
      for (z = 0; z < C; z++) {
        c._ptr[z] = c._ptr[z] - W;
        var Y = c._ptr[z], H = c._ptr[z + 1] - W;
        for (k = Y; k < H; k++)
          _ = c._index[k], _ > v - 1 && (c._values.splice(k, 1), c._index.splice(k, 1), W++);
      }
      c._ptr[z] = c._values.length;
    }
    return c._size[0] = v, c._size[1] = d, c;
  }
  n.prototype.reshape = function(c, v) {
    if (!J(c))
      throw new TypeError("Array expected");
    if (c.length !== 2)
      throw new Error("Sparse matrices can only be reshaped in two dimensions");
    c.forEach(function(G) {
      if (!tt(G) || !it(G) || G <= -2 || G === 0)
        throw new TypeError("Invalid size, must contain positive integers or -1 (size: " + Ft(c) + ")");
    });
    var d = this._size[0] * this._size[1];
    c = er(c, d);
    var F = c[0] * c[1];
    if (d !== F)
      throw new Error("Reshaping sparse matrix will result in the wrong number of elements");
    var E = v ? this.clone() : this;
    if (this._size[0] === c[0] && this._size[1] === c[1])
      return E;
    for (var w = [], N = 0; N < E._ptr.length; N++)
      for (var B = 0; B < E._ptr[N + 1] - E._ptr[N]; B++)
        w.push(N);
    for (var M = E._values.slice(), C = E._index.slice(), _ = 0; _ < E._index.length; _++) {
      var z = C[_], k = w[_], L = z * E._size[1] + k;
      w[_] = L % c[1], C[_] = Math.floor(L / c[1]);
    }
    E._values.length = 0, E._index.length = 0, E._ptr.length = c[1] + 1, E._size = c.slice();
    for (var U = 0; U < E._ptr.length; U++)
      E._ptr[U] = 0;
    for (var W = 0; W < M.length; W++) {
      var Y = C[W], H = w[W], ot = M[W], pt = p(Y, E._ptr[H], E._ptr[H + 1], E._index);
      o(pt, Y, H, ot, E._values, E._index, E._ptr);
    }
    return E;
  }, n.prototype.clone = function() {
    var c = new n({
      values: this._values ? lt(this._values) : void 0,
      index: lt(this._index),
      ptr: lt(this._ptr),
      size: lt(this._size),
      datatype: this._datatype
    });
    return c;
  }, n.prototype.size = function() {
    return this._size.slice(0);
  }, n.prototype.map = function(c, v) {
    if (!this._values)
      throw new Error("Cannot invoke map on a Pattern only matrix");
    var d = this, F = this._size[0], E = this._size[1], w = nr(c), N = function(M, C, _) {
      return w === 1 ? c(M) : w === 2 ? c(M, [C, _]) : c(M, [C, _], d);
    };
    return l(this, 0, F - 1, 0, E - 1, N, v);
  };
  function l(c, v, d, F, E, w, N) {
    var B = [], M = [], C = [], _ = r, z = 0;
    Tt(c._datatype) && (_ = e.find(r, [c._datatype, c._datatype]) || r, z = e.convert(0, c._datatype));
    for (var k = function(Zt, fe, xe) {
      Zt = w(Zt, fe, xe), _(Zt, z) || (B.push(Zt), M.push(fe));
    }, L = F; L <= E; L++) {
      C.push(B.length);
      var U = c._ptr[L], W = c._ptr[L + 1];
      if (N)
        for (var Y = U; Y < W; Y++) {
          var H = c._index[Y];
          H >= v && H <= d && k(c._values[Y], H - v, L - F);
        }
      else {
        for (var ot = {}, pt = U; pt < W; pt++) {
          var G = c._index[pt];
          ot[G] = c._values[pt];
        }
        for (var Ct = v; Ct <= d; Ct++) {
          var Pe = Ct in ot ? ot[Ct] : 0;
          k(Pe, Ct - v, L - F);
        }
      }
    }
    return C.push(B.length), new n({
      values: B,
      index: M,
      ptr: C,
      size: [d - v + 1, E - F + 1]
    });
  }
  n.prototype.forEach = function(c, v) {
    if (!this._values)
      throw new Error("Cannot invoke forEach on a Pattern only matrix");
    for (var d = this, F = this._size[0], E = this._size[1], w = 0; w < E; w++) {
      var N = this._ptr[w], B = this._ptr[w + 1];
      if (v)
        for (var M = N; M < B; M++) {
          var C = this._index[M];
          c(this._values[M], [C, w], d);
        }
      else {
        for (var _ = {}, z = N; z < B; z++) {
          var k = this._index[z];
          _[k] = this._values[z];
        }
        for (var L = 0; L < F; L++) {
          var U = L in _ ? _[L] : 0;
          c(U, [L, w], d);
        }
      }
    }
  }, n.prototype[Symbol.iterator] = function* () {
    if (!this._values)
      throw new Error("Cannot iterate a Pattern only matrix");
    for (var c = this._size[1], v = 0; v < c; v++)
      for (var d = this._ptr[v], F = this._ptr[v + 1], E = d; E < F; E++) {
        var w = this._index[E];
        yield {
          value: this._values[E],
          index: [w, v]
        };
      }
  }, n.prototype.toArray = function() {
    return g(this._values, this._index, this._ptr, this._size, !0);
  }, n.prototype.valueOf = function() {
    return g(this._values, this._index, this._ptr, this._size, !1);
  };
  function g(c, v, d, F, E) {
    var w = F[0], N = F[1], B = [], M, C;
    for (M = 0; M < w; M++)
      for (B[M] = [], C = 0; C < N; C++)
        B[M][C] = 0;
    for (C = 0; C < N; C++)
      for (var _ = d[C], z = d[C + 1], k = _; k < z; k++)
        M = v[k], B[M][C] = c ? E ? lt(c[k]) : c[k] : 1;
    return B;
  }
  return n.prototype.format = function(c) {
    for (var v = this._size[0], d = this._size[1], F = this.density(), E = "Sparse Matrix [" + Ft(v, c) + " x " + Ft(d, c) + "] density: " + Ft(F, c) + `
`, w = 0; w < d; w++)
      for (var N = this._ptr[w], B = this._ptr[w + 1], M = N; M < B; M++) {
        var C = this._index[M];
        E += `
    (` + Ft(C, c) + ", " + Ft(w, c) + ") ==> " + (this._values ? Ft(this._values[M], c) : "X");
      }
    return E;
  }, n.prototype.toString = function() {
    return Ft(this.toArray());
  }, n.prototype.toJSON = function() {
    return {
      mathjs: "SparseMatrix",
      values: this._values,
      index: this._index,
      ptr: this._ptr,
      size: this._size,
      datatype: this._datatype
    };
  }, n.prototype.diagonal = function(c) {
    if (c) {
      if (_t(c) && (c = c.toNumber()), !tt(c) || !it(c))
        throw new TypeError("The parameter k must be an integer number");
    } else
      c = 0;
    var v = c > 0 ? c : 0, d = c < 0 ? -c : 0, F = this._size[0], E = this._size[1], w = Math.min(F - d, E - v), N = [], B = [], M = [];
    M[0] = 0;
    for (var C = v; C < E && N.length < w; C++)
      for (var _ = this._ptr[C], z = this._ptr[C + 1], k = _; k < z; k++) {
        var L = this._index[k];
        if (L === C - v + d) {
          N.push(this._values[k]), B[N.length - 1] = L - d;
          break;
        }
      }
    return M.push(N.length), new n({
      values: N,
      index: B,
      ptr: M,
      size: [w, 1]
    });
  }, n.fromJSON = function(c) {
    return new n(c);
  }, n.diagonal = function(c, v, d, F, E) {
    if (!J(c))
      throw new TypeError("Array expected, size parameter");
    if (c.length !== 2)
      throw new Error("Only two dimensions matrix are supported");
    if (c = c.map(function(G) {
      if (_t(G) && (G = G.toNumber()), !tt(G) || !it(G) || G < 1)
        throw new Error("Size values must be positive integers");
      return G;
    }), d) {
      if (_t(d) && (d = d.toNumber()), !tt(d) || !it(d))
        throw new TypeError("The parameter k must be an integer number");
    } else
      d = 0;
    var w = r, N = 0;
    Tt(E) && (w = e.find(r, [E, E]) || r, N = e.convert(0, E));
    var B = d > 0 ? d : 0, M = d < 0 ? -d : 0, C = c[0], _ = c[1], z = Math.min(C - M, _ - B), k;
    if (J(v)) {
      if (v.length !== z)
        throw new Error("Invalid value array length");
      k = function(Ct) {
        return v[Ct];
      };
    } else if (Lt(v)) {
      var L = v.size();
      if (L.length !== 1 || L[0] !== z)
        throw new Error("Invalid matrix length");
      k = function(Ct) {
        return v.get([Ct]);
      };
    } else
      k = function() {
        return v;
      };
    for (var U = [], W = [], Y = [], H = 0; H < _; H++) {
      Y.push(U.length);
      var ot = H - B;
      if (ot >= 0 && ot < z) {
        var pt = k(ot);
        w(pt, N) || (W.push(ot + M), U.push(pt));
      }
    }
    return Y.push(U.length), new n({
      values: U,
      index: W,
      ptr: Y,
      size: [C, _]
    });
  }, n.prototype.swapRows = function(c, v) {
    if (!tt(c) || !it(c) || !tt(v) || !it(v))
      throw new Error("Row index must be positive integers");
    if (this._size.length !== 2)
      throw new Error("Only two dimensional matrix is supported");
    return K(c, this._size[0]), K(v, this._size[0]), n._swapRows(c, v, this._size[1], this._values, this._index, this._ptr), this;
  }, n._forEachRow = function(c, v, d, F, E) {
    for (var w = F[c], N = F[c + 1], B = w; B < N; B++)
      E(d[B], v[B]);
  }, n._swapRows = function(c, v, d, F, E, w) {
    for (var N = 0; N < d; N++) {
      var B = w[N], M = w[N + 1], C = p(c, B, M, E), _ = p(v, B, M, E);
      if (C < M && _ < M && E[C] === c && E[_] === v) {
        if (F) {
          var z = F[C];
          F[C] = F[_], F[_] = z;
        }
        continue;
      }
      if (C < M && E[C] === c && (_ >= M || E[_] !== v)) {
        var k = F ? F[C] : void 0;
        E.splice(_, 0, v), F && F.splice(_, 0, k), E.splice(_ <= C ? C + 1 : C, 1), F && F.splice(_ <= C ? C + 1 : C, 1);
        continue;
      }
      if (_ < M && E[_] === v && (C >= M || E[C] !== c)) {
        var L = F ? F[_] : void 0;
        E.splice(C, 0, c), F && F.splice(C, 0, L), E.splice(C <= _ ? _ + 1 : _, 1), F && F.splice(C <= _ ? _ + 1 : _, 1);
      }
    }
  }, n;
}, {
  isClass: !0
}), Ir = "matrix", qo = ["typed", "Matrix", "DenseMatrix", "SparseMatrix"], Uo = /* @__PURE__ */ wt(Ir, qo, (t) => {
  var {
    typed: e,
    Matrix: r,
    DenseMatrix: u,
    SparseMatrix: n
  } = t;
  return e(Ir, {
    "": function() {
      return i([]);
    },
    string: function(h) {
      return i([], h);
    },
    "string, string": function(h, D) {
      return i([], h, D);
    },
    Array: function(h) {
      return i(h);
    },
    Matrix: function(h) {
      return i(h, h.storage());
    },
    "Array | Matrix, string": i,
    "Array | Matrix, string, string": i
  });
  function i(s, h, D) {
    if (h === "dense" || h === "default" || h === void 0)
      return new u(s, D);
    if (h === "sparse")
      return new n(s, D);
    throw new TypeError("Unknown matrix type " + JSON.stringify(h) + ".");
  }
}), Tr = "flatten", $o = ["typed", "matrix"], jo = /* @__PURE__ */ wt(Tr, $o, (t) => {
  var {
    typed: e,
    matrix: r
  } = t;
  return e(Tr, {
    Array: function(n) {
      return Ye(n);
    },
    Matrix: function(n) {
      var i = Ye(n.toArray());
      return r(i);
    }
  });
}), Or = "map", Ho = ["typed"], Zo = /* @__PURE__ */ wt(Or, Ho, (t) => {
  var {
    typed: e
  } = t;
  return e(Or, {
    "Array, function": Vo,
    "Matrix, function": function(u, n) {
      return u.map(n);
    }
  });
});
function Vo(t, e) {
  var r = nr(e), u = function n(i, s) {
    if (Array.isArray(i))
      return i.map(function(p, a) {
        return n(p, s.concat(a));
      });
    try {
      return r === 1 ? e(i) : r === 2 ? e(i, s) : e(i, s, t);
    } catch (p) {
      if (p instanceof TypeError && "data" in p && p.data.category === "wrongType") {
        var h = "map attempted to call '".concat(p.data.fn, "(").concat(i), D = JSON.stringify(s);
        throw r === 2 ? h += "," + D : r !== 1 && (h += ",".concat(D, ",").concat(t)), h += ")' but argument ".concat(p.data.index + 1, " of type "), h += "".concat(p.data.actual, " does not match expected type "), h += p.data.expected.join(" or "), new TypeError(h);
      }
      throw p;
    }
  };
  return u(t, []);
}
var Pr = "zeros", Wo = ["typed", "config", "matrix", "BigNumber"], Yo = /* @__PURE__ */ wt(Pr, Wo, (t) => {
  var {
    typed: e,
    config: r,
    matrix: u,
    BigNumber: n
  } = t;
  return e(Pr, {
    "": function() {
      return r.matrix === "Array" ? i([]) : i([], "default");
    },
    // math.zeros(m, n, p, ..., format)
    // TODO: more accurate signature '...number | BigNumber, string' as soon as typed-function supports this
    "...number | BigNumber | string": function(p) {
      var a = p[p.length - 1];
      if (typeof a == "string") {
        var o = p.pop();
        return i(p, o);
      } else
        return r.matrix === "Array" ? i(p) : i(p, "default");
    },
    Array: i,
    Matrix: function(p) {
      var a = p.storage();
      return i(p.valueOf(), a);
    },
    "Array | Matrix, string": function(p, a) {
      return i(p.valueOf(), a);
    }
  });
  function i(D, p) {
    var a = s(D), o = a ? new n(0) : 0;
    if (h(D), p) {
      var f = u(p);
      return D.length > 0 ? f.resize(D, o) : f;
    } else {
      var l = [];
      return D.length > 0 ? Ve(l, D, o) : l;
    }
  }
  function s(D) {
    var p = !1;
    return D.forEach(function(a, o, f) {
      _t(a) && (p = !0, f[o] = a.toNumber());
    }), p;
  }
  function h(D) {
    D.forEach(function(p) {
      if (typeof p != "number" || !it(p) || p < 0)
        throw new Error("Parameters in function zeros must be positive integers");
    });
  }
}), vn = /* @__PURE__ */ go({
  config: Me
}), Xo = /* @__PURE__ */ Ao({}), Go = /* @__PURE__ */ Bo({}), ur = /* @__PURE__ */ Mo({}), gn = /* @__PURE__ */ Io({
  Matrix: ur
}), re = /* @__PURE__ */ Ei({
  BigNumber: vn,
  Complex: Xo,
  DenseMatrix: gn,
  Fraction: Go
}), Jo = /* @__PURE__ */ ko({
  config: Me,
  typed: re
}), Ko = /* @__PURE__ */ Zo({
  typed: re
}), Qo = /* @__PURE__ */ Lo({
  Matrix: ur,
  equalScalar: Jo,
  typed: re
}), mn = /* @__PURE__ */ Uo({
  DenseMatrix: gn,
  Matrix: ur,
  SparseMatrix: Qo,
  typed: re
}), ts = /* @__PURE__ */ Yo({
  BigNumber: vn,
  config: Me,
  matrix: mn,
  typed: re
}), es = /* @__PURE__ */ jo({
  matrix: mn,
  typed: re
});
function Pt(t, e, r, u) {
  const n = r.map((D) => t.data.get(D.dataId).values), i = {};
  e.variableNames.forEach((D, p) => {
    const a = `get${rs(D)}`;
    i[a] = function(...o) {
      const f = p;
      for (let l = 0; l < o.length; l++)
        o[l] = ns(o[l], 0, r[f].shape[l]);
      return n[p][us(o, r[f].shape)];
    };
  }), i.int = Math.trunc, i.atan = Math.atan2;
  const s = ts(e.outputShape), h = Ko(s, (D, p, a) => {
    i.getOutputCoords = () => p;
    let o;
    return i.setOutput = (f) => {
      o = Number.isNaN(f) ? 0 : Math.fround(f);
    }, e.userCode.bind(i)(), o;
  });
  return t.makeOutput(es(h), e.outputShape, u);
}
function rs(t) {
  return t[0].toUpperCase() + t.substring(1);
}
function ns(t, e, r) {
  return Math.min(Math.max(t, e), r - 1);
}
function us(t, e) {
  return t.reduce((r, u, n) => {
    for (let i = n + 1; i < e.length; i++)
      u *= e[i];
    return r + u;
  }, 0);
}
function is(t) {
  const e = t.shape[1], r = t.shape[0];
  return [{
    variableNames: ["p"],
    outputShape: [r, e],
    userCode: function() {
      const i = this.getOutputCoords();
      let s = this.getP(i[0], i[1] - 2);
      s += this.getP(i[0], i[1] - 1) * 4, s += this.getP(i[0], i[1]) * 6, s += this.getP(i[0], i[1] + 1) * 4, s += this.getP(i[0], i[1] + 2), this.setOutput(s);
    }
  }, {
    variableNames: ["p"],
    outputShape: [r, e],
    userCode: function() {
      const i = this.getOutputCoords();
      let s = this.getP(i[0] - 2, i[1]);
      s += this.getP(i[0] - 1, i[1]) * 4, s += this.getP(i[0], i[1]) * 6, s += this.getP(i[0] + 1, i[1]) * 4, s += this.getP(i[0] + 2, i[1]), s /= 256, this.setOutput(s);
    }
  }];
}
const os = (t) => {
  const e = t.inputs.image, r = t.backend, [u, n] = is(e), i = Pt(r, u, [e], e.dtype);
  return Pt(r, n, [i], e.dtype);
}, ss = {
  //: KernelConfig
  kernelName: "BinomialFilter",
  backendName: "cpu",
  kernelFunc: os
  // as {} as KernelFunc,
}, de = 7, xr = 3, as = xr * xr, $e = 4, fs = ($e + 1) * ($e + 1) / $e;
function cs(t) {
  const e = t.shape[1], r = t.shape[0];
  return {
    variableNames: ["image0", "image1", "image2"],
    outputShape: [r, e],
    userCode: function() {
      const n = this.getOutputCoords(), i = n[0], s = n[1], h = this.getImage1(i, s);
      if (h * h < as) {
        this.setOutput(0);
        return;
      }
      if (i < de || i > r - 1 - de) {
        this.setOutput(0);
        return;
      }
      if (s < de || s > e - 1 - de) {
        this.setOutput(0);
        return;
      }
      let D = !0, p = !0;
      for (let c = -1; c <= 1; c++)
        for (let v = -1; v <= 1; v++) {
          const d = this.getImage0(i + c, s + v), F = this.getImage1(i + c, s + v), E = this.getImage2(i + c, s + v);
          (h < d || h < F || h < E) && (D = !1), (h > d || h > F || h > E) && (p = !1);
        }
      if (!D && !p) {
        this.setOutput(0);
        return;
      }
      const a = this.getImage1(i, s + 1) + this.getImage1(i, s - 1) - 2 * this.getImage1(i, s), o = this.getImage1(i + 1, s) + this.getImage1(i - 1, s) - 2 * this.getImage1(i, s), f = 0.25 * (this.getImage1(i - 1, s - 1) + this.getImage1(i + 1, s + 1) - this.getImage1(i - 1, s + 1) - this.getImage1(i + 1, s - 1)), l = a * o - f * f;
      if (Math.abs(l) < 1e-4) {
        this.setOutput(0);
        return;
      }
      const g = (a + o) * (a + o) / l;
      if (Math.abs(g) >= fs) {
        this.setOutput(0);
        return;
      }
      this.setOutput(this.getImage1(i, s));
    }
  };
}
const hs = (t) => {
  let { image0: e, image1: r, image2: u } = t.inputs;
  const n = t.backend;
  e = gr().runKernel("DownsampleBilinear", { image: e }), u = gr().runKernel("UpsampleBilinear", { image: u, targetImage: r });
  const i = cs(r);
  return Pt(n, i, [e, r, u], r.dtype);
}, ls = {
  //: KernelConfig
  kernelName: "BuildExtremas",
  backendName: "cpu",
  kernelFunc: hs
  // as {} as KernelFunc,
}, oe = 36;
function Ds(t) {
  const e = new Float32Array(t.height);
  function r(i, s) {
    return t.values[i * t.width + s];
  }
  function u(i, s) {
    e[i] = s;
  }
  function n(i, s) {
    return Math.trunc(i - s * Math.floor(i / s));
  }
  for (let i = 0; i < t.height; i++) {
    let s = 0;
    for (let w = 1; w < oe; w++)
      r(i, w) > r(i, s) && (s = w);
    let h = n(s - 1 + oe, oe), D = n(s + 1, oe);
    const p = s - 1, a = r(i, h), o = s, f = r(i, s), l = s + 1, g = r(i, D), c = (l - o) * (l - p), v = (p - o) * (l - p), d = p - o;
    let F = s;
    if (Math.abs(c) > 1e-5 && Math.abs(v) > 1e-5 && Math.abs(d) > 1e-5) {
      const w = p * p, N = o * o;
      let B = (g - f) / c - (a - f) / v;
      Number.isNaN(B) && (B = 0), F = -((a - f + B * (N - w)) / d) / (2 * B), Number.isNaN(F) && (F = 0);
    }
    const E = 2 * Math.PI * (F + 0.5) / oe - Math.PI;
    u(i, E);
  }
  return e;
}
const ps = (t) => {
  const { histograms: e } = t.inputs, r = t.backend, u = { values: r.data.get(e.dataId).values, width: e.shape[1], height: e.shape[0] }, n = Ds(u);
  return r.makeOutput(n, [e.shape[0]], e.dtype);
}, ds = {
  //: KernelConfig
  kernelName: "ComputeExtremaAngles",
  backendName: "cpu",
  kernelFunc: ps
  // as {} as KernelFunc,
}, kr = 7;
function vs(t, e) {
  const r = [];
  for (let n = 1; n < e; n++)
    r.push("image" + n);
  return {
    variableNames: [...r, "extrema", "angles", "freakPoints"],
    outputShape: [t, je.length],
    userCode: function() {
      const n = (k, L, U) => {
        const W = "getImage" + k;
        return k < 1 || k >= e ? 0 : this[W](L, U);
      }, i = this.getOutputCoords(), s = i[0], h = i[1], D = this.getFreakPoints(h, 1), p = this.getFreakPoints(h, 2), a = this.int(this.getExtrema(s, 1)), o = this.getExtrema(s, 2), f = this.getExtrema(s, 3), l = this.getAngles(s), g = kr * Math.cos(l), c = kr * Math.sin(l), v = o + D * c + p * g, d = f + D * g + p * -c, F = this.int(Math.floor(d)), E = F + 1, w = this.int(Math.floor(v)), N = w + 1, B = n(a, w, F), M = n(a, w, E), C = n(a, N, F), _ = n(a, N, E), z = (E - d) * (N - v) * B + (d - F) * (N - v) * M + (E - d) * (v - w) * C + (d - F) * (v - w) * _;
      this.setOutput(z);
    }
  };
}
const gs = (t) => {
  const { gaussianImagesT: e, prunedExtremas: r, prunedExtremasAngles: u, freakPointsT: n, pyramidImagesLength: i } = t.inputs, s = t.backend, h = vs(r.shape[0], i);
  return Pt(s, h, [...e, r, u, n], "float32");
}, ms = {
  //: KernelConfig
  kernelName: "ComputeExtremaFreak",
  backendName: "cpu",
  kernelFunc: gs
  // as {} as KernelFunc,
}, En = (je.length - 1) * je.length / 2, ge = Math.ceil(En / 8);
function Es(t, e) {
  const r = new Float32Array(t.height * ge);
  function u(s, h) {
    return e.values[s * e.width + h];
  }
  function n(s, h) {
    return t.values[s * t.width + h];
  }
  function i(s, h, D) {
    r[s * ge + h] = D;
  }
  for (let s = 0; s < t.height; s++)
    for (let h = 0; h < ge; h++) {
      const D = h * 8;
      let p = 0;
      for (let a = 0; a < 8; a++) {
        if (D + a >= En)
          continue;
        const o = Math.trunc(u(D + a, 0)), f = Math.trunc(u(D + a, 1)), l = n(s, o), g = n(s, f);
        l < g + 0.01 && (p += Math.trunc(Math.pow(2, 7 - a)));
      }
      i(s, h, p);
    }
  return r;
}
const Fs = (t) => {
  const { extremaFreaks: e, positionT: r } = t.inputs, { backend: u } = t, n = { values: u.data.get(e.dataId).values, height: e.shape[0], width: e.shape[1] }, i = { values: u.data.get(r.dataId).values, width: r.shape[1] }, s = Es(n, i);
  return u.makeOutput(s, [e.shape[0], ge], "int32");
}, As = {
  //: KernelConfig
  kernelName: "ComputeFreakDescriptors",
  backendName: "cpu",
  kernelFunc: Fs
  // as {} as KernelFunc,
};
function ws(t, e) {
  const r = [];
  for (let n = 1; n < t; n++)
    r.push("image" + n);
  return {
    variableNames: [...r, "extrema"],
    outputShape: [e, 3, 3],
    // 3x3 pixels around the extrema
    userCode: function() {
      const n = (l, g, c) => {
        const v = "getImage" + l;
        if (!this.hasOwnProperty(v))
          throw new Error(`ComputeLocalization:: ${v} does not exist`);
        return this[v](g, c);
      }, i = this.getOutputCoords(), s = i[0];
      if (this.getExtrema(s, 0) == 0)
        return;
      const D = i[1] - 1, p = i[2] - 1, a = this.int(this.getExtrema(s, 1)), o = this.int(this.getExtrema(s, 2)), f = this.int(this.getExtrema(s, 3));
      this.setOutput(n(a, o + D, f + p));
    }
  };
}
const Cs = (t) => {
  const { prunedExtremasList: e, dogPyramidImagesT: r } = t.inputs, u = t.backend, n = ws(r.length, e.length), i = Lr(e, [e.length, e[0].length], "int32");
  return Pt(u, n, [...r.slice(1), i], r[0].dtype);
}, ys = {
  //: KernelConfig
  kernelName: "ComputeLocalization",
  backendName: "cpu",
  kernelFunc: Cs
  // as {} as KernelFunc,
}, Bs = 0.159154943091895, Xt = 36;
function Ns(t, e, r) {
  `${r}${t.shape[0]}${e.shape[0]}`;
  const u = [];
  for (let s = 1; s < r; s++)
    u.push("image" + s);
  const n = {
    variableNames: [...u, "extrema", "radial"],
    outputShape: [t.shape[0], e.shape[0], 2],
    // last dimension: [fbin, magnitude]
    userCode: function() {
      const s = (N, B, M) => {
        const C = "getImage" + N;
        return this.hasOwnProperty(C) ? this[C](B, M) : 0;
      }, h = this.getOutputCoords(), D = h[0], p = h[1], a = h[2], o = this.int(this.getRadial(p, 0)), f = this.int(this.getRadial(p, 1)), l = this.getRadial(p, 2), g = this.int(this.getExtrema(D, 1)), c = this.int(this.getExtrema(D, 2)), d = this.int(this.getExtrema(D, 3)) + f, F = c + o, E = s(g, F + 1, d) - s(g, F - 1, d), w = s(g, F, d + 1) - s(g, F, d - 1);
      if (a == 0) {
        const B = (this.atan(E, w) + Math.PI) * Xt * Bs;
        this.setOutput(B);
        return;
      }
      if (a == 1) {
        const N = Math.sqrt(w * w + E * E), B = l * N;
        this.setOutput(B);
        return;
      }
    }
  }, i = {
    variableNames: ["fbinMag"],
    outputShape: [t.shape[0], Xt],
    userCode: function() {
      function s(o, f) {
        return Math.trunc(o - f * Math.floor(o / f));
      }
      const h = this.getOutputCoords(), D = h[0], p = h[1];
      let a = 0;
      for (let o = 0; o < e.shape[0]; o++) {
        const f = this.getFbinMag(D, o, 0), l = Math.trunc(Math.floor(f - 0.5)), g = s(l + Xt, Xt), c = s(l + 1 + Xt, Xt);
        if (g == p || c == p) {
          const v = this.getFbinMag(D, o, 1), d = f - l - 0.5, F = d * -1 + 1;
          g == p && (a += F * v), c == p && (a += d * v);
        }
      }
      this.setOutput(a);
    }
  };
  return [n, i];
}
const _s = (t) => {
  const { gaussianImagesT: e, prunedExtremasT: r, radialPropertiesT: u, pyramidImagesLength: n } = t.inputs, i = t.backend, [s, h] = Ns(r, u, n), D = Pt(i, s, [...e, r, u], u.dtype);
  return Pt(i, h, [D], u.dtype);
}, Ms = {
  kernelName: "ComputeOrientationHistograms",
  backendName: "cpu",
  kernelFunc: _s
  // as {} as KernelFunc,
}, bs = (t) => {
  const e = t.inputs.image, r = t.backend, u = {
    variableNames: ["p"],
    outputShape: [Math.floor(e.shape[0] / 2), Math.floor(e.shape[1] / 2)],
    userCode: function() {
      const n = this.getOutputCoords(), i = n[0] * 2, s = n[1] * 2;
      let h = new Float32Array(1);
      h[0] = Math.fround(this.getP(i, s) * 0.25), h[0] += Math.fround(this.getP(i + 1, s) * 0.25), h[0] += Math.fround(this.getP(i, s + 1) * 0.25), h[0] += Math.fround(this.getP(i + 1, s + 1) * 0.25), this.setOutput(h[0]);
    }
  };
  return Pt(r, u, [e], e.dtype);
}, Ss = {
  //: KernelConfig
  kernelName: "DownsampleBilinear",
  backendName: "cpu",
  kernelFunc: bs
  // as {} as KernelFunc,
};
function Is(t, e) {
  return {
    variableNames: ["extrema"],
    outputShape: [t, e],
    userCode: function() {
      const u = this.getOutputCoords(), n = u[0] * 2, i = u[1] * 2;
      let s = 0, h = this.getExtrema(n, i);
      this.getExtrema(n + 1, i) != 0 ? (s = 1, h = this.getExtrema(n + 1, i)) : this.getExtrema(n, i + 1) != 0 ? (s = 2, h = this.getExtrema(n, i + 1)) : this.getExtrema(n + 1, i + 1) != 0 && (s = 3, h = this.getExtrema(n + 1, i + 1)), h < 0 ? this.setOutput(s * -1e3 + h) : this.setOutput(s * 1e3 + h);
    }
  };
}
const Ts = (t) => {
  const { extremasResultT: e } = t.inputs, r = t.backend, u = e.shape[0], n = e.shape[1], i = Math.floor(u / 2), s = Math.floor(n / 2), h = Is(i, s);
  return Pt(r, h, [e], e.dtype);
}, Os = {
  //: KernelConfig
  kernelName: "ExtremaReduction",
  backendName: "cpu",
  kernelFunc: Ts
  // as {} as KernelFunc,
}, Ht = 36, Ps = 5;
function xs(t) {
  const e = new Float32Array(t.height * Ht);
  function r(i, s) {
    return t.values[i * t.width + s];
  }
  function u(i, s, h) {
    e[i * Ht + s] = h;
  }
  function n(i, s) {
    return Math.trunc(i - s * Math.floor(i / s));
  }
  for (let i = 0; i < t.height; i++)
    for (let s = 0; s < Ht; s++) {
      const h = n(s - 1 + Ht, Ht), D = n(s + 1, Ht), p = 0.274068619061197 * r(i, h) + 0.451862761877606 * r(i, s) + 0.274068619061197 * r(i, D);
      u(i, s, p);
    }
  return e;
}
const ks = (t) => {
  const { histograms: e } = t.inputs, r = t.backend, u = { values: r.data.get(e.dataId).values, height: e.shape[0], width: e.shape[1] };
  for (let n = 0; n < Ps; n++)
    u.values = xs(u);
  return r.makeOutput(u.values, [e.shape[0], Ht], e.dtype);
}, Rs = {
  //: KernelConfig
  kernelName: "SmoothHistograms",
  backendName: "cpu",
  kernelFunc: ks
  // as {} as KernelFunc,
};
function zs(t) {
  return {
    variableNames: ["p"],
    outputShape: [t.shape[0], t.shape[1]],
    userCode: function() {
      const r = this.getOutputCoords(), u = r[0], n = r[1], i = Math.fround(0.5 * u) - 0.25, s = Math.fround(0.5 * n) - 0.25, h = Math.floor(i), D = Math.ceil(i), p = Math.floor(s), a = Math.ceil(s), o = this.int(h), f = this.int(D), l = this.int(p), g = this.int(a);
      let c = 0;
      c += this.getP(o, l) * Math.fround((a - s) * (D - i)), c += this.getP(f, l) * Math.fround((a - s) * (i - h)), c += this.getP(o, g) * Math.fround((s - p) * (D - i)), c += this.getP(f, g) * Math.fround((s - p) * (i - h)), this.setOutput(c);
    }
  };
}
const Ls = (t) => {
  const { image: e, targetImage: r } = t.inputs, u = t.backend, n = zs(r);
  return Pt(u, n, [e], e.dtype);
}, qs = {
  //: KernelConfig
  kernelName: "UpsampleBilinear",
  backendName: "cpu",
  kernelFunc: Ls
  // as {} as KernelFunc,
};
It(ss);
It(ls);
It(ds);
It(ms);
It(As);
It(ys);
It(Ms);
It(Ss);
It(Os);
It(Rs);
It(qs);
const Rr = 2, Us = async (t, e) => {
  const r = [];
  for (let u = 0; u < t.length; u++) {
    const n = t[u], i = new nu(n.width, n.height);
    await uu(), iu(() => {
      const s = Lr(n.data, [n.data.length], "float32").reshape([n.height, n.width]), { featurePoints: h } = i.detect(s), D = h.filter((f) => f.maxima), p = h.filter((f) => !f.maxima), a = Er({ points: D }), o = Er({ points: p });
      r.push({
        maximaPoints: D,
        minimaPoints: p,
        maximaPointsCluster: a,
        minimaPointsCluster: o,
        width: n.width,
        height: n.height,
        scale: n.scale
      }), e(u);
    });
  }
  return r;
};
class Hs {
  constructor() {
    this.data = null;
  }
  // input html Images
  compileImageTargets(e, r) {
    return new Promise(async (u, n) => {
      const i = [];
      for (let p = 0; p < e.length; p++) {
        const a = e[p], f = this.createProcessCanvas(a).getContext("2d");
        f.drawImage(a, 0, 0, a.width, a.height);
        const l = f.getImageData(0, 0, a.width, a.height), g = new Uint8Array(a.width * a.height);
        for (let v = 0; v < g.length; v++) {
          const d = v * 4;
          g[v] = Math.floor((l.data[d] + l.data[d + 1] + l.data[d + 2]) / 3);
        }
        const c = { data: g, height: a.height, width: a.width };
        i.push(c);
      }
      const s = 50 / i.length;
      let h = 0;
      this.data = [];
      for (let p = 0; p < i.length; p++) {
        const a = i[p], o = tu(a), f = s / o.length, l = await Us(o, () => {
          h += f, r(h);
        });
        this.data.push({
          targetImage: a,
          imageList: o,
          matchingData: l
        });
      }
      for (let p = 0; p < i.length; p++) {
        const a = mr(i[p]);
        this.data[p].trackingImageList = a;
      }
      const D = await this.compileTrack({ progressCallback: r, targetImages: i, basePercent: 50 });
      for (let p = 0; p < i.length; p++)
        this.data[p].trackingData = D[p];
      u(this.data);
    });
  }
  // not exporting imageList because too large. rebuild this using targetImage
  exportData() {
    const e = [];
    for (let u = 0; u < this.data.length; u++)
      e.push({
        //targetImage: this.data[i].targetImage,
        targetImage: {
          width: this.data[u].targetImage.width,
          height: this.data[u].targetImage.height
        },
        trackingData: this.data[u].trackingData,
        matchingData: this.data[u].matchingData
      });
    return eu({
      v: Rr,
      dataList: e
    });
  }
  importData(e) {
    const r = ru(new Uint8Array(e));
    if (!r.v || r.v !== Rr)
      return console.error("Your compiled .mind might be outdated. Please recompile"), [];
    const { dataList: u } = r;
    this.data = [];
    for (let n = 0; n < u.length; n++)
      this.data.push({
        targetImage: u[n].targetImage,
        trackingData: u[n].trackingData,
        matchingData: u[n].matchingData
      });
    return this.data;
  }
  createProcessCanvas(e) {
    return ou(e.width, e.height);
  }
  compileTrack({ progressCallback: e, targetImages: r, basePercent: u }) {
    return new Promise((n, i) => {
      const s = (100 - u) / r.length;
      let h = 0;
      const D = [];
      for (let p = 0; p < r.length; p++) {
        const a = r[p], o = mr(a), f = s / o.length, l = pu(o, (g) => {
          h += f, e(u + h);
        });
        D.push(l);
      }
      n(D);
    });
  }
}
export {
  Hs as OfflineCompiler
};
