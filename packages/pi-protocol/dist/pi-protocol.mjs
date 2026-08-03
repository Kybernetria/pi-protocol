#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name2) {
        super(`CodeGen: "code" for ${name2} not defined`);
        this.value = name2.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name2 = this.toName(nameOrPrefix);
        const { prefix } = name2;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name2);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name2.setValue(value, { property: prefix, itemIndex });
        return name2;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name2) => {
          if (name2.scopePath === void 0)
            throw new Error(`CodeGen: name "${name2}" has no value`);
          return (0, code_1._)`${scopeName}${name2.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name2) => {
          if (name2.value === void 0)
            throw new Error(`CodeGen: name "${name2}" has no value`);
          return name2.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name2) => {
            if (nameSet.has(name2))
              return;
            nameSet.set(name2, UsedValueState.Started);
            let c = valueCode(name2);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name2} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name2)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name2);
            }
            nameSet.set(name2, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name2, rhs) {
        super();
        this.varKind = varKind;
        this.name = name2;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name2, from, to) {
        super();
        this.varKind = varKind;
        this.name = name2;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name: name2, from, to } = this;
        return `for(${varKind} ${name2}=${from}; ${name2}<${to}; ${name2}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name2, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name2;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name2, args, async) {
        super();
        this.name = name2;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name2 = this._extScope.value(prefixOrName, value);
        const vs = this._values[name2.prefix] || (this._values[name2.prefix] = /* @__PURE__ */ new Set());
        vs.add(name2);
        return name2;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name2 = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name2.str] = rhs;
        this._leafNode(new Def(varKind, name2, rhs));
        return name2;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name2 = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name2, from, to), () => forBody(name2));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name2 = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name2, (0, code_1._)`${arr}[${i}]`);
            forBody(name2);
          });
        }
        return this._for(new ForIter("of", varKind, name2, iterable), () => forBody(name2));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name2 = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name2, obj), () => forBody(name2));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name2, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name2, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType: schemaType2 }) => schemaType2 ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType2} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message: message2 }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message2 == "function" ? message2(cxt) : message2]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType2, allowUndefined = false) {
      return !schemaType2.length || schemaType2.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize2) {
      if (normalize2 !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType: schemaType2, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType2.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType: schemaType2, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType2.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType2) ? schemaType2 : [schemaType2];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve5.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve5(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path) {
      let input = path;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    function normalizeComponentEncoding(component, esc) {
      const func = esc !== true ? escape : unescape;
      if (component.scheme !== void 0) {
        component.scheme = func(component.scheme);
      }
      if (component.userinfo !== void 0) {
        component.userinfo = func(component.userinfo);
      }
      if (component.host !== void 0) {
        component.host = func(component.host);
      }
      if (component.path !== void 0) {
        component.path = func(component.path);
      }
      if (component.query !== void 0) {
        component.query = func(component.query);
      }
      if (component.fragment !== void 0) {
        component.fragment = func(component.fragment);
      }
      return component;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = component.host;
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      normalizeComponentEncoding,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name2) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name2
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path && path !== "/" ? path : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizeComponentEncoding, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize2(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        serialize(parse(uri, options), options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve5(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const resolved = resolveComponent(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative4, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative4 = parse(serialize(relative4, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative4.scheme) {
        target.scheme = relative4.scheme;
        target.userinfo = relative4.userinfo;
        target.host = relative4.host;
        target.port = relative4.port;
        target.path = removeDotSegments(relative4.path || "");
        target.query = relative4.query;
      } else {
        if (relative4.userinfo !== void 0 || relative4.host !== void 0 || relative4.port !== void 0) {
          target.userinfo = relative4.userinfo;
          target.host = relative4.host;
          target.port = relative4.port;
          target.path = removeDotSegments(relative4.path || "");
          target.query = relative4.query;
        } else {
          if (!relative4.path) {
            target.path = base.path;
            if (relative4.query !== void 0) {
              target.query = relative4.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative4.path[0] === "/") {
              target.path = removeDotSegments(relative4.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative4.path;
              } else if (!base.path) {
                target.path = relative4.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative4.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative4.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative4.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      if (typeof uriA === "string") {
        uriA = unescape(uriA);
        uriA = serialize(normalizeComponentEncoding(parse(uriA, options), true), { ...options, skipEscape: true });
      } else if (typeof uriA === "object") {
        uriA = serialize(normalizeComponentEncoding(uriA, true), { ...options, skipEscape: true });
      }
      if (typeof uriB === "string") {
        uriB = unescape(uriB);
        uriB = serialize(normalizeComponentEncoding(parse(uriB, options), true), { ...options, skipEscape: true });
      } else if (typeof uriB === "object") {
        uriB = serialize(normalizeComponentEncoding(uriB, true), { ...options, skipEscape: true });
      }
      return uriA.toLowerCase() === uriB.toLowerCase();
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escape(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = unescape(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    function parse(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = URL.domainToASCII(parsed.host.toLowerCase());
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = unescape(parsed.host);
            }
          }
          if (parsed.path) {
            parsed.path = escape(unescape(parsed.path));
          }
          if (parsed.fragment) {
            parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return parsed;
    }
    var fastUri = {
      SCHEMES,
      normalize: normalize2,
      resolve: resolve5,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = {};
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message2 = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message2);
          else
            throw new Error(message2);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name2, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name2] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name2 in this.opts.formats) {
        const format = this.opts.formats[name2];
        if (format)
          this.addFormat(name2, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation2();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv2, sch) {
        return $data ? ajv2.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv20202 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv20202;
    module.exports = exports = Ajv20202;
    module.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv20202;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// packages/pi-protocol/cli/bin.ts
import { basename as basename2 } from "node:path";

// packages/pi-protocol/cli/check.ts
import { resolve as resolve3 } from "node:path";

// packages/pi-protocol/conformance/index.ts
import { readFileSync as readFileSync2, realpathSync as realpathSync2, statSync as statSync2 } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, isAbsolute as isAbsolute2, join, relative as relative2, resolve as resolve2 } from "node:path";

// packages/pi-protocol/contract/errors.ts
var ProtocolContractError = class extends Error {
  code;
  issues;
  constructor(code, message2, issues = [], options) {
    super(message2, options);
    this.name = "ProtocolContractError";
    this.code = code;
    this.issues = Object.freeze([...issues]);
  }
};

// packages/pi-protocol/contract/fingerprint.ts
import { createHash } from "node:crypto";

// packages/pi-protocol/contract/normalize.ts
function normalizeJsonValue(value) {
  return normalize(value);
}
function canonicalJson(value) {
  return JSON.stringify(normalizeJsonValue(value));
}
function normalize(value) {
  if (value === null || typeof value !== "object") {
    return typeof value === "number" && Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(normalize));
  const result = {};
  for (const key of Object.keys(value).sort()) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: normalize(value[key])
    });
  }
  return Object.freeze(result);
}

// packages/pi-protocol/contract/fingerprint.ts
function fingerprintProtocolManifest(manifest) {
  const digest = createHash("sha256").update(canonicalJson(manifest)).digest("hex");
  return `sha256:${digest}`;
}

// packages/pi-protocol/contract/limits.ts
var PROTOCOL_CONTRACT_LIMITS = Object.freeze({
  maxJsonBytes: 1048576,
  maxJsonDepth: 64,
  maxJsonNodes: 5e4,
  maxCollectionEntries: 2048,
  maxStringBytes: 262144,
  maxSchemaDepth: 32,
  maxSchemaNodes: 2e4,
  maxDiagnostics: 20
});
function resolveContractLimits(overrides) {
  if (!overrides) return PROTOCOL_CONTRACT_LIMITS;
  const result = { ...PROTOCOL_CONTRACT_LIMITS };
  for (const key of Object.keys(PROTOCOL_CONTRACT_LIMITS)) {
    const value = overrides[key];
    if (value === void 0) continue;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ProtocolContractError("BUDGET_EXCEEDED", `Contract limit ${key} must be a positive safe integer`);
    }
    result[key] = Math.min(value, PROTOCOL_CONTRACT_LIMITS[key]);
  }
  return Object.freeze(result);
}

// packages/pi-protocol/definition-abi.ts
var DEFINITION_MARK = /* @__PURE__ */ Symbol.for("@kybernetria/pi-protocol.definition.v1");
function markAdmittedProtocolDefinition(definition) {
  Object.defineProperty(definition, DEFINITION_MARK, { value: true, enumerable: false });
}
function isAdmittedProtocolDefinition(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  return candidate[DEFINITION_MARK] === true && Object.isFrozen(candidate) && Object.isFrozen(candidate.manifest) && candidate.manifest.schemaVersion === 1 && /^sha256:[0-9a-f]{64}$/.test(candidate.contractDigest) && typeof candidate.provides === "object" && candidate.provides !== null;
}

// packages/pi-protocol/contract/json.ts
import { types as utilTypes } from "node:util";
function parseJsonSource(source, limits) {
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > limits.maxJsonBytes) {
    throw budgetError(`Manifest JSON exceeds the ${limits.maxJsonBytes} byte limit`);
  }
  rejectDuplicateObjectKeys(source);
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ProtocolContractError("INVALID_JSON", "Manifest is not valid JSON");
  }
  return assertBoundedJsonValue(value, limits);
}
function assertBoundedJsonValue(value, limits) {
  const stack = [{ value, depth: 1 }];
  const activeAncestors = /* @__PURE__ */ new WeakSet();
  let nodes = 0;
  let estimatedBytes = 0;
  const addBytes = (amount) => {
    estimatedBytes += amount;
    if (estimatedBytes > limits.maxJsonBytes) {
      throw budgetError(`JSON value exceeds the ${limits.maxJsonBytes} byte limit`);
    }
  };
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.exit) {
      activeAncestors.delete(current.value);
      continue;
    }
    nodes += 1;
    if (nodes > limits.maxJsonNodes) throw budgetError(`JSON value exceeds the ${limits.maxJsonNodes} node limit`);
    if (current.depth > limits.maxJsonDepth) throw budgetError(`JSON value exceeds the depth limit of ${limits.maxJsonDepth}`);
    const item = current.value;
    if (item === null) {
      addBytes(4);
      continue;
    }
    if (typeof item === "string") {
      const rawBytes = Buffer.byteLength(item, "utf8");
      if (rawBytes > limits.maxStringBytes) throw budgetError(`JSON string exceeds the ${limits.maxStringBytes} byte limit`);
      addBytes(Buffer.byteLength(JSON.stringify(item), "utf8"));
      continue;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw invalidValue("JSON numbers must be finite");
      addBytes(String(Object.is(item, -0) ? 0 : item).length);
      continue;
    }
    if (typeof item === "boolean") {
      addBytes(item ? 4 : 5);
      continue;
    }
    if (typeof item !== "object") throw invalidValue(`JSON cannot contain ${typeof item} values`);
    if (utilTypes.isProxy(item)) throw invalidValue("JSON values cannot contain Proxy objects");
    if (activeAncestors.has(item)) throw invalidValue("JSON values cannot be cyclic");
    activeAncestors.add(item);
    stack.push({ value: item, depth: current.depth, exit: true });
    try {
      if (Array.isArray(item)) {
        if (item.length > limits.maxCollectionEntries) {
          throw budgetError(`JSON array exceeds the ${limits.maxCollectionEntries} item limit`);
        }
        if (Object.getOwnPropertySymbols(item).length > 0) throw invalidValue("JSON arrays cannot have symbol properties");
        const ownNames = Object.getOwnPropertyNames(item);
        if (ownNames.some((name2) => name2 !== "length" && !isArrayIndex(name2, item.length))) {
          throw invalidValue("JSON arrays cannot have named properties");
        }
        addBytes(2 + Math.max(0, item.length - 1));
        for (let index = item.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw invalidValue("JSON arrays must be dense data arrays");
          }
          stack.push({ value: descriptor.value, depth: current.depth + 1 });
        }
        continue;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw invalidValue("JSON objects must be ordinary objects or null-prototype objects");
      }
      if (Object.getOwnPropertySymbols(item).length > 0) throw invalidValue("JSON objects cannot have symbol properties");
      const names = Object.getOwnPropertyNames(item);
      if (names.length > limits.maxCollectionEntries) {
        throw budgetError(`JSON object exceeds the ${limits.maxCollectionEntries} property limit`);
      }
      addBytes(2 + Math.max(0, names.length - 1));
      for (let index = names.length - 1; index >= 0; index -= 1) {
        const name2 = names[index];
        const nameBytes = Buffer.byteLength(name2, "utf8");
        if (nameBytes > limits.maxStringBytes) throw budgetError(`JSON property name exceeds the ${limits.maxStringBytes} byte limit`);
        const descriptor = Object.getOwnPropertyDescriptor(item, name2);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw invalidValue("JSON objects must contain only enumerable data properties");
        }
        addBytes(Buffer.byteLength(JSON.stringify(name2), "utf8") + 1);
        stack.push({ value: descriptor.value, depth: current.depth + 1 });
      }
    } catch (error) {
      if (error instanceof ProtocolContractError) throw error;
      throw invalidValue("JSON object inspection failed");
    }
  }
  return value;
}
function rejectDuplicateObjectKeys(source) {
  const stack = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      stack.push({ type: "object", keys: /* @__PURE__ */ new Set() });
      continue;
    }
    if (character === "[") {
      stack.push({ type: "array" });
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      continue;
    }
    if (character !== '"') continue;
    const end = findStringEnd(source, index);
    let next = end + 1;
    while (next < source.length && /\s/.test(source[next])) next += 1;
    const context = stack[stack.length - 1];
    if (context?.type === "object" && source[next] === ":") {
      let key;
      try {
        key = JSON.parse(source.slice(index, end + 1));
      } catch {
        throw new ProtocolContractError("INVALID_JSON", "Manifest is not valid JSON");
      }
      if (context.keys.has(key)) {
        throw new ProtocolContractError("INVALID_JSON", "Manifest contains a duplicate object member");
      }
      context.keys.add(key);
    }
    index = end;
  }
}
function findStringEnd(source, start) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === '"') return index;
  }
  throw new ProtocolContractError("INVALID_JSON", "Manifest is not valid JSON");
}
function isArrayIndex(name2, length) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(name2)) return false;
  const index = Number(name2);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === name2;
}
function budgetError(message2) {
  return new ProtocolContractError("BUDGET_EXCEEDED", message2);
}
function invalidValue(message2) {
  return new ProtocolContractError("INVALID_JSON_VALUE", message2);
}

// packages/pi-protocol/contract/validate.ts
var import__ = __toESM(require__(), 1);

// packages/pi-protocol/contract/manifest.schema.json
var manifest_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://pi.dev/protocol/manifest-v1.schema.json",
  title: "Pi Protocol Manifest v1",
  type: "object",
  additionalProperties: false,
  required: ["$schema", "schemaVersion", "node", "provides"],
  properties: {
    $schema: { const: "https://pi.dev/protocol/manifest-v1.schema.json" },
    schemaVersion: { const: 1 },
    node: { $ref: "#/$defs/node" },
    $defs: { $ref: "#/$defs/schemaMap" },
    provides: {
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: { $ref: "#/$defs/provide" }
    },
    extensions: { $ref: "#/$defs/extensions" }
  },
  $defs: {
    name: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^[a-z0-9][a-z0-9_-]*$"
    },
    target: {
      type: "string",
      minLength: 3,
      maxLength: 257,
      pattern: "^[a-z0-9][a-z0-9_-]*\\.[a-z0-9][a-z0-9_-]*$"
    },
    tags: {
      type: "array",
      maxItems: 64,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 128 }
    },
    extensions: {
      type: "object",
      maxProperties: 32,
      propertyNames: {
        minLength: 3,
        maxLength: 128,
        pattern: "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$"
      },
      additionalProperties: { $ref: "#/$defs/jsonValue" }
    },
    jsonValue: {
      type: ["null", "boolean", "number", "string", "array", "object"],
      items: { $ref: "#/$defs/jsonValue" },
      additionalProperties: { $ref: "#/$defs/jsonValue" }
    },
    node: {
      type: "object",
      additionalProperties: false,
      required: ["id", "purpose"],
      properties: {
        id: { $ref: "#/$defs/name" },
        purpose: { type: "string", minLength: 1, maxLength: 4096 },
        tags: { $ref: "#/$defs/tags" },
        extensions: { $ref: "#/$defs/extensions" }
      }
    },
    provide: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description", "inputSchema", "outputSchema"],
      properties: {
        name: { $ref: "#/$defs/name" },
        description: { type: "string", minLength: 1, maxLength: 8192 },
        inputSchema: { $ref: "#/$defs/schemaNode" },
        outputSchema: { $ref: "#/$defs/schemaNode" },
        tags: { $ref: "#/$defs/tags" },
        effects: {
          type: "array",
          maxItems: 11,
          uniqueItems: true,
          items: {
            enum: [
              "fs.read",
              "fs.write",
              "db.read",
              "db.write",
              "network.read",
              "network.send",
              "process.spawn",
              "model.call",
              "protocol.invoke",
              "external.transaction",
              "system.configure"
            ]
          }
        },
        traits: { $ref: "#/$defs/traits" },
        lifecycle: { $ref: "#/$defs/lifecycle" },
        extensions: { $ref: "#/$defs/extensions" }
      }
    },
    traits: {
      type: "object",
      additionalProperties: false,
      properties: {
        determinism: { enum: ["deterministic", "best_effort"] },
        replay: { enum: ["safe", "idempotent", "unsafe"] },
        interaction: { enum: ["request_response", "continuable", "background"] },
        cancellable: { type: "boolean" },
        streaming: { type: "boolean" }
      }
    },
    lifecycle: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        status: { enum: ["active", "deprecated"] },
        deprecatedSince: { type: "string", minLength: 1, maxLength: 64 },
        sunsetAfter: { type: "string", minLength: 1, maxLength: 64 },
        replacement: { $ref: "#/$defs/target" },
        message: { type: "string", minLength: 1, maxLength: 2048 }
      }
    },
    schemaMap: {
      type: "object",
      maxProperties: 256,
      additionalProperties: { $ref: "#/$defs/schemaNode" }
    },
    schemaNode: {
      type: "object",
      additionalProperties: false,
      properties: {
        $ref: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^#(?:/.*)?$"
        },
        $defs: { $ref: "#/$defs/schemaMap" },
        type: {
          oneOf: [
            { enum: ["object", "array", "string", "number", "integer", "boolean", "null"] },
            {
              type: "array",
              minItems: 2,
              maxItems: 2,
              uniqueItems: true,
              contains: { const: "null" },
              minContains: 1,
              maxContains: 1,
              items: { enum: ["object", "array", "string", "number", "integer", "boolean", "null"] }
            }
          ]
        },
        required: {
          type: "array",
          maxItems: 256,
          uniqueItems: true,
          items: { type: "string", maxLength: 256 }
        },
        properties: { $ref: "#/$defs/schemaMap" },
        additionalProperties: {
          oneOf: [
            { type: "boolean" },
            { $ref: "#/$defs/schemaNode" }
          ]
        },
        items: { $ref: "#/$defs/schemaNode" },
        enum: {
          type: "array",
          minItems: 1,
          maxItems: 256,
          uniqueItems: true,
          items: { $ref: "#/$defs/jsonValue" }
        },
        const: { $ref: "#/$defs/jsonValue" },
        minimum: { type: "number" },
        maximum: { type: "number" },
        exclusiveMinimum: { type: "number" },
        exclusiveMaximum: { type: "number" },
        multipleOf: { type: "number", exclusiveMinimum: 0 },
        minLength: { type: "integer", minimum: 0, maximum: 1e6 },
        maxLength: { type: "integer", minimum: 0, maximum: 1e6 },
        pattern: { type: "string", maxLength: 512 },
        minItems: { type: "integer", minimum: 0, maximum: 1e5 },
        maxItems: { type: "integer", minimum: 0, maximum: 1e5 },
        uniqueItems: { type: "boolean" },
        minProperties: { type: "integer", minimum: 0, maximum: 1e5 },
        maxProperties: { type: "integer", minimum: 0, maximum: 1e5 },
        oneOf: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { $ref: "#/$defs/schemaNode" }
        },
        title: { type: "string", maxLength: 512 },
        description: { type: "string", maxLength: 8192 },
        examples: {
          type: "array",
          maxItems: 16,
          items: { $ref: "#/$defs/jsonValue" }
        },
        contentEncoding: { type: "string", minLength: 1, maxLength: 128 },
        contentMediaType: { type: "string", minLength: 1, maxLength: 256 },
        contentSchema: { $ref: "#/$defs/schemaNode" },
        "x-pi-sensitive": { const: true }
      }
    }
  }
};

// packages/pi-protocol/contract/validate.ts
var JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";
var ajv = createAjv();
var validateManifestShape = ajv.compile(manifest_schema_default);
function assertCanonicalManifest(value, limits) {
  if (!validateManifestShape(value)) {
    throw new ProtocolContractError(
      "MANIFEST_INVALID",
      "Protocol manifest does not satisfy the canonical v1 contract",
      normalizeAjvErrors(validateManifestShape.errors, limits.maxDiagnostics)
    );
  }
  assertManifestSemantics(value, limits);
}
function compileProvideContracts(manifest, limits) {
  const compiled = /* @__PURE__ */ Object.create(null);
  for (let index = 0; index < manifest.provides.length; index += 1) {
    const provide = manifest.provides[index];
    assertAcyclicLocalReferences(provide.inputSchema, manifest.$defs, limits, `/provides/${index}/inputSchema`);
    assertAcyclicLocalReferences(provide.outputSchema, manifest.$defs, limits, `/provides/${index}/outputSchema`);
    const inputSchema = schemaWithManifestDefinitions(provide.inputSchema, manifest.$defs);
    const outputSchema = schemaWithManifestDefinitions(provide.outputSchema, manifest.$defs);
    compiled[provide.name] = Object.freeze({
      target: `${manifest.node.id}.${provide.name}`,
      contract: provide,
      validateInput: compilePayloadValidator(inputSchema, limits, `${provide.name}.inputSchema`),
      validateOutput: compilePayloadValidator(outputSchema, limits, `${provide.name}.outputSchema`)
    });
  }
  return Object.freeze(compiled);
}
function createAjv() {
  const instance = new import__.Ajv2020({
    allErrors: false,
    coerceTypes: false,
    strict: true,
    strictTypes: false,
    strictRequired: false,
    useDefaults: false,
    removeAdditional: false,
    validateFormats: false,
    unicodeRegExp: true,
    logger: false,
    ownProperties: true
  });
  instance.addKeyword({ keyword: "x-pi-sensitive", schemaType: "boolean", valid: true });
  return instance;
}
function compilePayloadValidator(schema, limits, schemaLabel) {
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch {
    throw new ProtocolContractError(
      "SCHEMA_INVALID",
      `Protocol ${schemaLabel} could not be compiled`,
      [{ path: `/${escapePointer(schemaLabel)}`, keyword: "compile", message: "schema compilation failed" }]
    );
  }
  return (value) => {
    try {
      assertBoundedJsonValue(value, limits);
    } catch (error) {
      if (error instanceof ProtocolContractError) {
        return {
          valid: false,
          issues: Object.freeze([{ path: "", keyword: error.code, message: boundText(error.message) }])
        };
      }
      return { valid: false, issues: Object.freeze([{ path: "", keyword: "INVALID_JSON_VALUE", message: "Invalid JSON value" }]) };
    }
    try {
      return validate(value) ? { valid: true } : { valid: false, issues: Object.freeze(normalizeAjvErrors(validate.errors, limits.maxDiagnostics)) };
    } catch {
      return {
        valid: false,
        issues: Object.freeze([{ path: "", keyword: "VALIDATION_FAILED", message: "contract validation did not complete" }])
      };
    }
  };
}
function schemaWithManifestDefinitions(schema, manifestDefinitions) {
  const localDefinitions = schema.$defs ?? {};
  const definitions = { ...manifestDefinitions ?? {}, ...localDefinitions };
  return {
    $schema: JSON_SCHEMA_2020_12,
    ...schema,
    ...Object.keys(definitions).length > 0 ? { $defs: definitions } : {}
  };
}
function assertAcyclicLocalReferences(rootSchema, manifestDefinitions, limits, rootPath) {
  const definitions = { ...manifestDefinitions ?? {}, ...rootSchema.$defs ?? {} };
  const root = { ...rootSchema, ...Object.keys(definitions).length > 0 ? { $defs: definitions } : {} };
  const nodes = /* @__PURE__ */ new Map();
  const pending = [{ schema: root, path: "#" }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (nodes.has(current.path)) continue;
    if (nodes.size >= limits.maxSchemaNodes) {
      throw schemaGraphError(rootPath, `schema reference graph exceeds ${limits.maxSchemaNodes} nodes`);
    }
    const children = schemaChildren(current.schema, current.path);
    nodes.set(current.path, { schema: current.schema, children: children.map((child) => child.path) });
    for (const child of children) pending.push(child);
  }
  const states = /* @__PURE__ */ new Map();
  for (const start of nodes.keys()) {
    if (states.has(start)) continue;
    const stack = [];
    states.set(start, 1);
    stack.push({ path: start, edges: referenceEdges(start), index: 0 });
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.edges.length) {
        states.set(frame.path, 2);
        stack.pop();
        continue;
      }
      const target = frame.edges[frame.index++];
      const targetState = states.get(target);
      if (targetState === 1) throw schemaGraphError(rootPath, "cyclic local schema references are not supported");
      if (targetState === 2) continue;
      states.set(target, 1);
      stack.push({ path: target, edges: referenceEdges(target), index: 0 });
    }
  }
  function referenceEdges(path) {
    const node = nodes.get(path);
    const edges = [...node.children];
    if (node.schema.$ref) {
      const target = normalizeLocalReference(node.schema.$ref);
      if (!target || !nodes.has(target)) throw schemaGraphError(rootPath, "local schema reference does not resolve to a schema node");
      edges.push(target);
    }
    return edges;
  }
}
function schemaChildren(schema, path) {
  const children = [];
  addMap(schema.$defs, "$defs");
  addMap(schema.properties, "properties");
  if (typeof schema.additionalProperties === "object") add(schema.additionalProperties, "additionalProperties");
  if (schema.items) add(schema.items, "items");
  if (schema.contentSchema) add(schema.contentSchema, "contentSchema");
  for (let index = 0; index < (schema.oneOf?.length ?? 0); index += 1) add(schema.oneOf[index], `oneOf/${index}`);
  return children;
  function addMap(map, segment) {
    if (!map) return;
    for (const [name2, child] of Object.entries(map)) add(child, `${segment}/${escapePointer(name2)}`);
  }
  function add(child, suffix) {
    children.push({ schema: child, path: `${path}/${suffix}` });
  }
}
function normalizeLocalReference(reference) {
  if (reference === "#") return "#";
  let pointer;
  try {
    pointer = decodeURIComponent(reference.slice(1));
  } catch {
    return void 0;
  }
  if (!pointer.startsWith("/")) return void 0;
  const tokens = pointer.slice(1).split("/");
  const decoded = [];
  for (const token of tokens) {
    if (/~(?:[^01]|$)/.test(token)) return void 0;
    decoded.push(token.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  return `#/${decoded.map(escapePointer).join("/")}`;
}
function schemaGraphError(path, message2) {
  return new ProtocolContractError("SCHEMA_INVALID", "Protocol contract schema reference graph is invalid", [
    { path, keyword: "referenceGraph", message: message2 }
  ]);
}
function assertManifestSemantics(manifest, limits) {
  const issues = [];
  const addIssue = (issue2) => {
    if (issues.length < limits.maxDiagnostics) issues.push(issue2);
  };
  const names = /* @__PURE__ */ new Set();
  for (let index = 0; index < manifest.provides.length; index += 1) {
    const provide = manifest.provides[index];
    if (names.has(provide.name)) {
      addIssue({ path: `/provides/${index}/name`, keyword: "uniqueProvide", message: "provide name must be unique within its node" });
    }
    names.add(provide.name);
    if (provide.lifecycle?.status === "active" && (provide.lifecycle.deprecatedSince !== void 0 || provide.lifecycle.sunsetAfter !== void 0 || provide.lifecycle.replacement !== void 0)) {
      addIssue({ path: `/provides/${index}/lifecycle`, keyword: "lifecycle", message: "active provides cannot declare deprecation scheduling" });
    }
  }
  assertSchemaBudgets(manifest, limits, addIssue);
  if (issues.length > 0) {
    throw new ProtocolContractError("SCHEMA_INVALID", "Protocol contract schemas failed semantic validation", issues);
  }
}
function assertSchemaBudgets(manifest, limits, addIssue) {
  const stack = [];
  for (const [name2, schema] of Object.entries(manifest.$defs ?? {})) {
    checkPrototypeSensitiveName(name2, `/$defs/${escapePointer(name2)}`, addIssue);
    stack.push({ schema, depth: 1, path: `/$defs/${escapePointer(name2)}` });
  }
  for (let index = 0; index < manifest.provides.length; index += 1) {
    stack.push({ schema: manifest.provides[index].inputSchema, depth: 1, path: `/provides/${index}/inputSchema` });
    stack.push({ schema: manifest.provides[index].outputSchema, depth: 1, path: `/provides/${index}/outputSchema` });
  }
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > limits.maxSchemaNodes) {
      addIssue({ path: current.path, keyword: "schemaBudget", message: `schema graph exceeds ${limits.maxSchemaNodes} nodes` });
      return;
    }
    if (current.depth > limits.maxSchemaDepth) {
      addIssue({ path: current.path, keyword: "schemaBudget", message: `schema depth exceeds ${limits.maxSchemaDepth}` });
      return;
    }
    checkRange(current.schema.minLength, current.schema.maxLength, current.path, "Length", addIssue);
    checkRange(current.schema.minItems, current.schema.maxItems, current.path, "Items", addIssue);
    checkRange(current.schema.minProperties, current.schema.maxProperties, current.path, "Properties", addIssue);
    checkRange(current.schema.minimum, current.schema.maximum, current.path, "imum", addIssue);
    if (current.schema.pattern !== void 0 && !isLinearTimePattern(current.schema.pattern)) {
      addIssue({
        path: `${current.path}/pattern`,
        keyword: "patternSafety",
        message: "pattern is outside the bounded linear-time protocol subset"
      });
    }
    checkMapNames(current.schema.$defs, `${current.path}/$defs`, addIssue);
    checkMapNames(current.schema.properties, `${current.path}/properties`, addIssue);
    pushMap(stack, current.schema.$defs, current.depth, `${current.path}/$defs`);
    pushMap(stack, current.schema.properties, current.depth, `${current.path}/properties`);
    if (typeof current.schema.additionalProperties === "object") {
      stack.push({ schema: current.schema.additionalProperties, depth: current.depth + 1, path: `${current.path}/additionalProperties` });
    }
    if (current.schema.items) stack.push({ schema: current.schema.items, depth: current.depth + 1, path: `${current.path}/items` });
    if (current.schema.contentSchema) stack.push({ schema: current.schema.contentSchema, depth: current.depth + 1, path: `${current.path}/contentSchema` });
    for (let index = (current.schema.oneOf?.length ?? 0) - 1; index >= 0; index -= 1) {
      stack.push({ schema: current.schema.oneOf[index], depth: current.depth + 1, path: `${current.path}/oneOf/${index}` });
    }
  }
}
function isLinearTimePattern(pattern) {
  let variableQuantifiers = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "\\") {
      const escaped = pattern[index + 1];
      if (escaped === void 0 || /[1-9kg]/.test(escaped)) return false;
      index += 1;
      continue;
    }
    if (character === "[") {
      let closed = false;
      for (index += 1; index < pattern.length; index += 1) {
        if (pattern[index] === "\\") {
          if (pattern[index + 1] === void 0) return false;
          index += 1;
          continue;
        }
        if (pattern[index] === "]") {
          closed = true;
          break;
        }
      }
      if (!closed) return false;
      continue;
    }
    if (character === "]" || character === "(" || character === ")" || character === "|") return false;
    if (character === "^" && index !== 0) return false;
    if (character === "$" && index !== pattern.length - 1) return false;
    if (character === "*" || character === "+" || character === "?") {
      variableQuantifiers += 1;
    } else if (character === "{") {
      const match = /^\{([0-9]+)(?:,([0-9]*))?\}/.exec(pattern.slice(index));
      if (!match) return false;
      const minimum = Number(match[1]);
      const hasRange = match[2] !== void 0;
      const maximum = match[2] === "" ? void 0 : match[2] === void 0 ? minimum : Number(match[2]);
      if (minimum > 1e3 || maximum !== void 0 && (maximum > 1e3 || maximum < minimum)) return false;
      if (hasRange && maximum !== minimum) variableQuantifiers += 1;
      index += match[0].length - 1;
    } else if (character === "}") {
      return false;
    }
    if (variableQuantifiers > 1) return false;
  }
  return variableQuantifiers === 0 || pattern.startsWith("^");
}
function checkMapNames(schemas, parentPath, addIssue) {
  if (!schemas) return;
  for (const name2 of Object.keys(schemas)) checkPrototypeSensitiveName(name2, `${parentPath}/${escapePointer(name2)}`, addIssue);
}
function checkPrototypeSensitiveName(name2, path, addIssue) {
  if (name2 === "__proto__" || name2 === "prototype" || name2 === "constructor") {
    addIssue({ path, keyword: "prototypeSensitiveName", message: "schema map uses a prototype-sensitive name" });
  }
}
function pushMap(stack, schemas, parentDepth, parentPath) {
  if (!schemas) return;
  for (const [name2, schema] of Object.entries(schemas)) {
    stack.push({ schema, depth: parentDepth + 1, path: `${parentPath}/${escapePointer(name2)}` });
  }
}
function checkRange(minimum, maximum, path, suffix, addIssue) {
  if (minimum !== void 0 && maximum !== void 0 && minimum > maximum) {
    addIssue({ path, keyword: `min${suffix}`, message: `min${suffix} cannot exceed max${suffix}` });
  }
}
function normalizeAjvErrors(errors, limit) {
  return (errors ?? []).slice(0, limit).map((error) => ({
    path: boundText(error.instancePath || ""),
    keyword: boundText(error.keyword),
    message: boundText(error.message ?? "contract validation failed")
  }));
}
function boundText(value) {
  return value.length <= 240 ? value : `${value.slice(0, 239)}\u2026`;
}
function escapePointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

// packages/pi-protocol/contract/parse.ts
function parseProtocolManifest(source, options = {}) {
  const limits = resolveContractLimits(options.limits);
  const value = typeof source === "string" ? parseJsonSource(source, limits) : assertBoundedJsonValue(source, limits);
  if (!isRecord(value)) {
    throw new ProtocolContractError("MANIFEST_INVALID", "Protocol manifest must be a JSON object");
  }
  if (value.schemaVersion !== 1) {
    throw new ProtocolContractError("UNSUPPORTED_VERSION", "Protocol manifest schemaVersion is not supported");
  }
  assertCanonicalManifest(value, limits);
  const manifest = normalizeJsonValue(value);
  const definition = {
    manifest,
    contractDigest: fingerprintProtocolManifest(manifest),
    provides: compileProvideContracts(manifest, limits)
  };
  markAdmittedProtocolDefinition(definition);
  return Object.freeze(definition);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/pi-protocol/contract/types.ts
var STANDARD_EFFECTS = [
  "fs.read",
  "fs.write",
  "db.read",
  "db.write",
  "network.read",
  "network.send",
  "process.spawn",
  "model.call",
  "protocol.invoke",
  "external.transaction",
  "system.configure"
];

// packages/pi-protocol/sdk/agent-profile.ts
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
function parsePiAgentProfiles(source) {
  const value = typeof source === "string" ? parseJsonSource(source, PROTOCOL_CONTRACT_LIMITS) : assertBoundedJsonValue(source, PROTOCOL_CONTRACT_LIMITS);
  if (!plain(value)) throw new Error("pi.agents.json must be an object");
  exact(value, ["schemaVersion", "agents"], "pi.agents.json");
  if (value.schemaVersion !== 1 || !plain(value.agents)) throw new Error("pi.agents.json schemaVersion and agents are required");
  if (Object.keys(value.agents).length > 128) throw new Error("pi.agents.json has too many agents");
  for (const [name2, profile] of Object.entries(value.agents)) validateProfile(name2, profile);
  return normalizeJsonValue(value);
}
function resolvePiAgentProfiles(profiles, baseDir) {
  const realBase = realpathSync(baseDir);
  const agents = Object.fromEntries(Object.entries(profiles.agents).map(([name2, profile]) => {
    const candidate = resolve(realBase, profile.prompt);
    if (!within(realBase, candidate)) throw new Error(`Agent ${name2} prompt escapes profile base directory`);
    const realPrompt = realpathSync(candidate);
    if (!within(realBase, realPrompt) || !statSync(realPrompt).isFile()) throw new Error(`Agent ${name2} prompt must be a contained file`);
    const promptText = readFileSync(realPrompt, "utf8");
    if (Buffer.byteLength(promptText, "utf8") > 262144) throw new Error(`Agent ${name2} prompt exceeds size limit`);
    return [name2, Object.freeze({ ...profile, promptText })];
  }));
  return Object.freeze({ schemaVersion: 1, agents: Object.freeze(agents) });
}
function validateProfile(name2, value) {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(name2) || !plain(value)) throw new Error(`Invalid agent profile ${name2}`);
  exact(value, ["prompt", "tools", "modelPolicy", "protocolAccess", "continuation"], `agents.${name2}`);
  if (typeof value.prompt !== "string" || !value.prompt || value.prompt.length > 512 || isAbsolute(value.prompt)) throw new Error(`Agent ${name2} prompt must be a relative path`);
  if (value.tools !== void 0) stringArray(value.tools, 64, `agents.${name2}.tools`);
  if (value.modelPolicy !== void 0) {
    if (!plain(value.modelPolicy)) throw new Error(`agents.${name2}.modelPolicy must be an object`);
    exact(value.modelPolicy, ["class", "specific", "thinkingLevel"], `agents.${name2}.modelPolicy`);
    if (value.modelPolicy.class !== void 0 && !["fast", "balanced", "reasoning"].includes(String(value.modelPolicy.class))) throw new Error(`Invalid model class for ${name2}`);
    if (value.modelPolicy.specific !== void 0 && (typeof value.modelPolicy.specific !== "string" || value.modelPolicy.specific.length > 256)) throw new Error(`Invalid model override for ${name2}`);
    if (value.modelPolicy.thinkingLevel !== void 0 && !["off", "minimal", "low", "medium", "high", "xhigh"].includes(String(value.modelPolicy.thinkingLevel))) throw new Error(`Invalid thinking level for ${name2}`);
  }
  if (value.protocolAccess !== void 0) {
    if (!plain(value.protocolAccess)) throw new Error(`agents.${name2}.protocolAccess must be an object`);
    exact(value.protocolAccess, ["targets", "effects", "maxDepth", "maxInvocations"], `agents.${name2}.protocolAccess`);
    stringArray(value.protocolAccess.targets, 256, `agents.${name2}.protocolAccess.targets`);
    if (value.protocolAccess.targets.some((target) => target !== "*" && !/^[a-z0-9][a-z0-9_-]{0,127}\.(?:\*|[a-z0-9][a-z0-9_-]{0,127})$/.test(target))) throw new Error(`Invalid protocol target for ${name2}`);
    if (value.protocolAccess.effects !== void 0) {
      stringArray(value.protocolAccess.effects, STANDARD_EFFECTS.length, `agents.${name2}.protocolAccess.effects`);
      if (value.protocolAccess.effects.some((effect) => !STANDARD_EFFECTS.includes(effect))) throw new Error(`Invalid protocol effect for ${name2}`);
    }
    integer(value.protocolAccess.maxDepth, 0, 32, `agents.${name2}.protocolAccess.maxDepth`);
    integer(value.protocolAccess.maxInvocations, 1, 1024, `agents.${name2}.protocolAccess.maxInvocations`);
  }
  if (value.continuation !== void 0) {
    if (!plain(value.continuation)) throw new Error(`agents.${name2}.continuation must be an object`);
    exact(value.continuation, ["ttlMs", "maxSessions"], `agents.${name2}.continuation`);
    integer(value.continuation.ttlMs, 1e3, 864e5, `agents.${name2}.continuation.ttlMs`);
    integer(value.continuation.maxSessions, 1, 256, `agents.${name2}.continuation.maxSessions`);
  }
}
function exact(value, allowed, path) {
  const set = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !set.has(key));
  if (unknown) throw new Error(`${path} has unknown field ${unknown}`);
}
function stringArray(value, max, path) {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !item || item.length > 256) || new Set(value).size !== value.length) throw new Error(`${path} must be a bounded unique string array`);
}
function integer(value, min, max, path) {
  if (value !== void 0 && (!Number.isSafeInteger(value) || value < min || value > max)) throw new Error(`${path} must be an integer from ${min} to ${max}`);
}
function plain(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function within(base, candidate) {
  const path = relative(base, candidate);
  return path === "" || !path.startsWith("..") && !isAbsolute(path);
}

// packages/pi-protocol/cli/generator.ts
var GENERATED_PROTOCOL_HEADER = "// @generated by pi-protocol generate; DO NOT EDIT.";
function generateProtocolTypes(definition) {
  const lines = [
    GENERATED_PROTOCOL_HEADER,
    `// contract-digest: ${definition.contractDigest}`,
    `import type { ProtocolAgentExecutor, ProtocolHandler } from "@kybernetria/pi-protocol/core";`,
    "",
    `export const PROTOCOL_NODE_ID = ${JSON.stringify(definition.manifest.node.id)} as const;`,
    "export const PROTOCOL_TARGETS = {",
    ...definition.manifest.provides.map((provide) => `  ${safeProperty(provide.name)}: ${JSON.stringify(`${definition.manifest.node.id}.${provide.name}`)},`),
    "} as const;",
    "",
    `export type ProtocolProvideName = ${definition.manifest.provides.map((provide) => JSON.stringify(provide.name)).join(" | ") || "never"};`,
    "export type ProtocolBinding = ProtocolHandler | ProtocolAgentExecutor;",
    "export type ProtocolBindings = {",
    ...definition.manifest.provides.map((provide) => `  ${JSON.stringify(provide.name)}: ProtocolBinding;`),
    "};",
    ""
  ];
  for (const [name2, schema] of Object.entries(definition.manifest.$defs ?? {})) {
    lines.push(`export type ${typeName(name2)} = ${schemaType(schema, definition, /* @__PURE__ */ new Set([name2]))};`);
  }
  if (Object.keys(definition.manifest.$defs ?? {}).length) lines.push("");
  for (const provide of definition.manifest.provides) {
    const name2 = typeName(provide.name);
    lines.push(`export type ${name2}Input = ${schemaType(provide.inputSchema, definition, /* @__PURE__ */ new Set())};`);
    lines.push(`export type ${name2}Output = ${schemaType(provide.outputSchema, definition, /* @__PURE__ */ new Set())};`);
  }
  lines.push("");
  return lines.join("\n");
}
function schemaType(schema, definition, seen) {
  if (schema.$ref) {
    const name2 = schema.$ref.slice("#/$defs/".length).replaceAll("~1", "/").replaceAll("~0", "~");
    return typeName(name2);
  }
  if (schema.const !== void 0) return literal(schema.const);
  if (schema.enum) return schema.enum.map(literal).join(" | ") || "never";
  if (schema.oneOf) return schema.oneOf.map((child) => schemaType(child, definition, seen)).join(" | ");
  const rawType = schema.type;
  if (Array.isArray(rawType)) return rawType.map((type) => type === "null" ? "null" : schemaType({ ...schema, type }, definition, seen)).join(" | ");
  switch (rawType) {
    case "null":
      return "null";
    case "boolean":
      return "boolean";
    case "number":
    case "integer":
      return "number";
    case "string":
      return "string";
    case "array":
      return `readonly ${parenthesize(schemaType(schema.items ?? {}, definition, seen))}[]`;
    case "object": {
      const required = new Set(schema.required ?? []);
      const properties = Object.entries(schema.properties ?? {}).map(
        ([key, child]) => `${safeProperty(key)}${required.has(key) ? "" : "?"}: ${schemaType(child, definition, seen)};`
      );
      if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        properties.push(`[key: string]: ${schemaType(schema.additionalProperties, definition, seen)};`);
      }
      return properties.length ? `{ ${properties.join(" ")} }` : "Record<string, never>";
    }
    default:
      return "unknown";
  }
}
function literal(value) {
  return value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string" ? JSON.stringify(value) : "unknown";
}
function parenthesize(value) {
  return value.includes(" | ") ? `(${value})` : value;
}
function safeProperty(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}
function typeName(value) {
  const output = value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join("");
  return /^[A-Za-z_$]/.test(output) ? output : `Protocol${output || "Value"}`;
}

// packages/pi-protocol/conformance/index.ts
function checkProtocolPackage(packageDir, options = {}) {
  const directory = realpathSync2(packageDir);
  const issues = [];
  let packageJson;
  try {
    packageJson = strictObject(JSON.parse(readBounded(join(directory, "package.json"), 1048576)), "package.json");
    if (typeof packageJson.name !== "string" || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(packageJson.name) || packageJson.name.length > 214) throw new Error("package name is invalid");
    if (typeof packageJson.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) throw new Error("package version is invalid");
  } catch (error) {
    issues.push(issue("error", "PACKAGE_INVALID", directory, message(error)));
  }
  let definition;
  try {
    definition = parseProtocolManifest(readBounded(join(directory, "pi.protocol.json"), 1048576));
  } catch (error) {
    issues.push(issue("error", statSafe(join(directory, "pi.protocol.json")) ? "MANIFEST_INVALID" : "MANIFEST_MISSING", directory, message(error)));
  }
  if (packageJson && packageJson.name !== "@kybernetria/pi-protocol" && options.requireDependency !== false) {
    const dependencies = { ...object(packageJson.dependencies), ...object(packageJson.peerDependencies), ...object(packageJson.devDependencies) };
    const range = dependencies["@kybernetria/pi-protocol"];
    if (typeof range !== "string") issues.push(issue("error", "DEPENDENCY_MISSING", directory, "@kybernetria/pi-protocol dependency is required"));
    else if (!compatibleDependency(range)) issues.push(issue("error", "DEPENDENCY_INCOMPATIBLE", directory, `Unsupported @kybernetria/pi-protocol range ${range}`));
  }
  const profilePath = join(directory, "pi.agents.json");
  if (statSafe(profilePath)) {
    try {
      resolvePiAgentProfiles(parsePiAgentProfiles(readBounded(profilePath, 1048576)), directory);
    } catch (error) {
      issues.push(issue("error", "PROFILE_INVALID", directory, message(error)));
    }
  }
  if (definition) {
    try {
      const generatedPath = configuredGeneratedPath(packageJson, directory);
      if (generatedPath) {
        const expected = generateProtocolTypes(definition);
        if (!statSafe(generatedPath)) issues.push(issue("error", "GENERATED_MISSING", directory, `Missing generated artifact ${relative2(directory, generatedPath)}`));
        else if (readBounded(generatedPath, 2097152) !== expected) issues.push(issue("error", "GENERATED_DRIFT", directory, `Generated artifact drift: ${relative2(directory, generatedPath)}`));
      }
    } catch (error) {
      issues.push(issue("error", "PACKAGE_INVALID", directory, message(error)));
    }
  }
  return Object.freeze({
    packageDir: directory,
    ...typeof packageJson?.name === "string" ? { packageName: packageJson.name } : {},
    ...definition ? { definition } : {},
    issues: Object.freeze(issues),
    ok: !issues.some((entry) => entry.severity === "error")
  });
}
async function discoverProtocolPackages(root, options = {}) {
  const realRoot = realpathSync2(root);
  const maxDepth = bounded(options.maxDepth, 16, 1, 64);
  const maxDirectories = bounded(options.maxDirectories, 1e4, 1, 1e5);
  const output = [];
  const seen = /* @__PURE__ */ new Set();
  const queue = [{ directory: realRoot, depth: 0 }];
  while (queue.length) {
    const next = queue.shift();
    if (seen.size >= maxDirectories) throw new Error("Recursive protocol package discovery exceeded directory limit");
    let real;
    try {
      real = realpathSync2(next.directory);
    } catch {
      continue;
    }
    if (!within2(realRoot, real) || seen.has(real)) continue;
    seen.add(real);
    if (statSafe(join(real, "pi.protocol.json"))) output.push(real);
    if (next.depth >= maxDepth) continue;
    for (const entry of (await readdir(real, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".git", "node_modules", "dist", "out", "coverage", "archive"].includes(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      queue.push({ directory: join(real, entry.name), depth: next.depth + 1 });
    }
  }
  return Object.freeze(output.sort());
}
async function checkProtocolTree(root, options = {}) {
  const packages = await discoverProtocolPackages(root, options);
  return Object.freeze(packages.map((directory) => checkProtocolPackage(directory, options)));
}
function configuredGeneratedPath(packageJson, directory) {
  const config = object(packageJson?.piProtocol);
  if (typeof config.generated !== "string") return void 0;
  if (!config.generated || config.generated.length > 512 || isAbsolute2(config.generated)) throw new Error("piProtocol.generated must be a bounded relative path");
  const path = resolve2(directory, config.generated);
  if (!within2(directory, path)) throw new Error("piProtocol.generated escapes package directory");
  return path;
}
function compatibleDependency(range) {
  const value = range.trim();
  return /^(?:file:|link:|workspace:)/.test(value) || /^https:\/\/github\.com\/Kybernetria\/pi-protocol\/releases\/download\/v4\.\d+\.\d+\/.+\.tgz$/.test(value) || /(?:^|[<>=~^|\s])4(?:\.\d+)?(?:\.\d+)?/.test(value);
}
function readBounded(path, maxBytes) {
  const stat = statSync2(path);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error(`${basename(path)} exceeds size limit`);
  return readFileSync2(path, "utf8");
}
function strictObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be an object`);
  return value;
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function statSafe(path) {
  try {
    return statSync2(path).isFile();
  } catch {
    return false;
  }
}
function within2(root, candidate) {
  const path = relative2(root, candidate);
  return path === "" || !path.startsWith("..") && !isAbsolute2(path);
}
function bounded(value, fallback, min, max) {
  const out = value ?? fallback;
  if (!Number.isSafeInteger(out) || out < min || out > max) throw new Error("Invalid conformance discovery limit");
  return out;
}
function issue(severity, code, packageDir, message2) {
  return Object.freeze({ severity, code, packageDir, message: message2.slice(0, 1024) });
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}

// packages/pi-protocol/cli/check.ts
async function runCheckCli(argv2 = process.argv.slice(2)) {
  const recursive = argv2.includes("--recursive");
  const json = argv2.includes("--json");
  const paths = argv2.filter((arg) => !arg.startsWith("--"));
  const targets = paths.length ? paths : [process.cwd()];
  const results = [];
  for (const target of targets) {
    const path = resolve3(target);
    if (recursive) results.push(...await checkProtocolTree(path));
    else results.push(checkProtocolPackage(path));
  }
  if (json) console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2));
  else for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.packageName ?? result.packageDir}`);
    for (const entry of result.issues) console.log(`  ${entry.severity.toUpperCase()} ${entry.code}: ${entry.message}`);
  }
  if (!results.length) {
    console.error("No protocol packages found");
    return 1;
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

// packages/pi-protocol/fabric.ts
import { createHash as createHash2 } from "node:crypto";

// packages/pi-protocol/package.json
var package_default = {
  name: "@kybernetria/pi-protocol",
  version: "4.0.0",
  description: "Pi Protocol \u2014 shared in-memory fabric with handler/agent execution, protocol tool, and pi SDK adapter",
  type: "module",
  main: "./index.ts",
  types: "./index.ts",
  bin: {
    "pi-protocol": "dist/pi-protocol.mjs",
    "pi-protocol-check": "dist/pi-protocol.mjs",
    "pi-protocol-generate": "dist/pi-protocol.mjs",
    "pi-protocol-doctor": "dist/pi-protocol.mjs"
  },
  exports: {
    ".": "./index.ts",
    "./contract": "./contract/index.ts",
    "./core": "./core/index.ts",
    "./provenance": "./provenance/index.ts",
    "./conformance": "./conformance/index.ts",
    "./pi": "./tool/index.ts",
    "./pi/agents": "./sdk/agent-session.ts"
  },
  files: [
    "*.ts",
    "contract/*",
    "core/*.ts",
    "cli/*.ts",
    "conformance/*.ts",
    "dist/*.mjs",
    "provenance/*.ts",
    "tool/*.ts",
    "sdk/*.ts",
    "prompts/*.md",
    "LICENSE"
  ],
  pi: {
    extensions: [
      "./extension.ts"
    ]
  },
  keywords: [
    "pi-protocol",
    "pi-extension",
    "protocol-fabric"
  ],
  author: "kybernetria",
  license: "AGPL-3.0",
  repository: {
    type: "git",
    url: "git+https://github.com/kybernetria/pi-protocol.git",
    directory: "packages/pi-protocol"
  },
  peerDependencies: {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "@earendil-works/pi-ai": "*"
  },
  peerDependenciesMeta: {
    "@earendil-works/pi-coding-agent": {
      optional: true
    },
    "@earendil-works/pi-ai": {
      optional: true
    },
    "@earendil-works/pi-tui": {
      optional: true
    }
  },
  dependencies: {
    ajv: "8.18.0"
  }
};

// packages/pi-protocol/provenance/ledger.ts
import { AsyncLocalStorage } from "node:async_hooks";
var MAX_EVENT_BYTES = 16384;
var MAX_SINK_EVENTS = 1024;
var MAX_SINK_BYTES = 2097152;
var receiptContext = new AsyncLocalStorage();
var AuditLedger = class {
  policy;
  sequence = 0;
  retainedBytes = 0;
  events = [];
  receipts = /* @__PURE__ */ new Map();
  receiptOrder = [];
  subscribers = /* @__PURE__ */ new Set();
  subscriberQueues = /* @__PURE__ */ new Map();
  subscriberActive = /* @__PURE__ */ new Set();
  progressObservers = /* @__PURE__ */ new Set();
  progressQueues = /* @__PURE__ */ new Map();
  lookupRates = /* @__PURE__ */ new WeakMap();
  sinkQueue = [];
  sinkQueueBytes = 0;
  sinkDraining = false;
  requiredStartsInFlight = 0;
  counters = { evictedEvents: 0, evictedReceipts: 0, sinkDropped: 0, sinkFailures: 0, outcomeUnknown: 0, observerDropped: 0, observerFailures: 0 };
  constructor(policy = {}) {
    this.policy = {
      ...policy,
      mode: policy.mode ?? "best_effort",
      timeoutMs: Math.min(Math.max(policy.timeoutMs ?? 250, 1), 5e3),
      maxEvents: Math.min(Math.max(policy.maxEvents ?? 4096, 64), 8192),
      maxReceipts: Math.min(Math.max(policy.maxReceipts ?? 2048, 64), 4096),
      maxBytes: Math.min(Math.max(policy.maxBytes ?? 8388608, 262144), 16777216)
    };
  }
  createReceipt(input) {
    const invocationId = `invocation_${crypto.randomUUID()}`;
    const parentInvocationId = receiptContext.getStore();
    const receipt = {
      schemaVersion: 1,
      invocationId,
      revision: 1,
      state: "requested",
      traceId: input.traceId,
      spanId: input.spanId,
      ...parentInvocationId ? { parentInvocationId } : {},
      target: input.target,
      requestedAt: Date.now(),
      effectsMayHaveOccurred: false,
      childInvocationIds: [],
      externalAudit: this.policy.sink ? this.policy.mode === "required" ? "pending" : "queued" : "not_configured"
    };
    this.receipts.set(invocationId, receipt);
    this.receiptOrder.push(invocationId);
    if (parentInvocationId) {
      const parent = this.receipts.get(parentInvocationId);
      if (parent && parent.childInvocationIds.length < 100) parent.childInvocationIds.push(invocationId);
    }
    this.evictReceipts();
    this.append(this.event(receipt, "invocation.requested"));
    return receipt;
  }
  bind(receipt, registration) {
    if (registration.registrationId !== void 0) receipt.registrationId = registration.registrationId;
    if (registration.generation !== void 0) receipt.generation = registration.generation;
    if (registration.contractDigest !== void 0) receipt.contractDigest = registration.contractDigest;
    receipt.revision += 1;
  }
  async start(receipt, inputBytes) {
    receipt.state = "started";
    receipt.startedAt = Date.now();
    receipt.revision += 1;
    const event = this.event(receipt, "invocation.started", { inputBytes, effectsMayHaveOccurred: false });
    this.append(event);
    if (!this.policy.sink || this.policy.mode !== "required") return true;
    if (this.requiredStartsInFlight >= 64) {
      receipt.externalAudit = "failed";
      this.counters.sinkFailures += 1;
      return false;
    }
    this.requiredStartsInFlight += 1;
    let append;
    try {
      append = Promise.resolve(this.policy.sink.append(event));
    } catch {
      append = Promise.reject(new Error("audit append failed"));
    }
    void append.then(
      () => {
        this.requiredStartsInFlight = Math.max(0, this.requiredStartsInFlight - 1);
      },
      () => {
        this.requiredStartsInFlight = Math.max(0, this.requiredStartsInFlight - 1);
      }
    );
    try {
      await withTimeout(append, this.policy.timeoutMs);
      receipt.externalAudit = "accepted";
      receipt.revision += 1;
      return true;
    } catch {
      receipt.externalAudit = "failed";
      receipt.revision += 1;
      this.counters.sinkFailures += 1;
      return false;
    }
  }
  dispatched(receipt) {
    receipt.effectsMayHaveOccurred = true;
    receipt.revision += 1;
  }
  reject(receipt, code) {
    if (this.policy.sink && this.policy.mode === "required" && receipt.externalAudit === "pending") receipt.externalAudit = "queued";
    receipt.state = "rejected";
    receipt.outcomeCode = code;
    receipt.endedAt = Date.now();
    receipt.revision += 1;
    const event = this.event(receipt, "invocation.rejected", { outcomeCode: code, effectsMayHaveOccurred: false });
    this.append(event);
    if (this.policy.sink && this.policy.mode === "required") this.enqueueSink(event, jsonBytes(event));
    this.evictReceipts();
  }
  approval(receipt, state) {
    const type = state === "requested" ? "invocation.approval_requested" : state === "approved" ? "invocation.approved" : "invocation.denied";
    this.append(this.event(receipt, type, { effectsMayHaveOccurred: false }));
  }
  cancelRequested(receipt) {
    this.append(this.event(receipt, "invocation.cancel_requested", { effectsMayHaveOccurred: receipt.effectsMayHaveOccurred }));
  }
  outcomeUnknown(receipt) {
    if (isTerminal(receipt.state)) return;
    receipt.state = "outcome_unknown";
    receipt.revision += 1;
    this.counters.outcomeUnknown += 1;
    this.append(this.event(receipt, "invocation.outcome_unknown", { outcomeCode: "OUTCOME_UNKNOWN", effectsMayHaveOccurred: true }));
  }
  settle(receipt, result) {
    const endedAt = Date.now();
    receipt.endedAt = endedAt;
    receipt.durationMs = receipt.startedAt === void 0 ? 0 : Math.max(0, endedAt - receipt.startedAt);
    if (result.ok) {
      receipt.state = "succeeded";
      receipt.outcomeCode = "OK";
    } else if (result.error.code === "CANCELLED") {
      receipt.state = "cancelled";
      receipt.outcomeCode = "CANCELLED";
    } else {
      receipt.state = "failed";
      receipt.outcomeCode = result.error.code;
    }
    receipt.revision += 1;
    const type = receipt.state === "succeeded" ? "invocation.succeeded" : receipt.state === "cancelled" ? "invocation.cancelled" : "invocation.failed";
    const event = this.event(receipt, type, {
      durationMs: receipt.durationMs,
      outcomeCode: receipt.outcomeCode,
      outputBytes: result.ok ? jsonBytes(result.output) : void 0,
      effectsMayHaveOccurred: receipt.effectsMayHaveOccurred
    });
    this.append(event);
    if (this.policy.sink && this.policy.mode === "required") this.enqueueSink(event, jsonBytes(event));
    this.evictReceipts();
  }
  runWithReceipt(receiptId, callback) {
    return receiptContext.run(receiptId, callback);
  }
  snapshot(receipt) {
    return deepFreeze(omitUndefined({ ...receipt, childInvocationIds: [...receipt.childInvocationIds] }));
  }
  trackedResult(result, receipt) {
    const summary = this.snapshot(receipt);
    return result.ok ? { ok: true, output: result.output, result, receipt: summary } : { ok: false, error: result.error, result, receipt: summary };
  }
  getReceipt(invocationId, authority) {
    const receipt = this.receipts.get(invocationId);
    if (!this.allowLookup(authority) || !receipt) return void 0;
    return this.authorizedSnapshot(receipt, authority);
  }
  causal(invocationId, authority, options = {}) {
    const root = this.receipts.get(invocationId);
    if (!this.allowLookup(authority) || !root || !this.authorizedSnapshot(root, authority)) return void 0;
    const maxDepth = Math.min(Math.max(options.maxDepth ?? 4, 0), 8);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const output = [];
    const queue = [{ id: invocationId, depth: 0 }];
    let truncated = false;
    while (queue.length && output.length < limit) {
      const next = queue.shift();
      const receipt = this.receipts.get(next.id);
      const authorized = receipt ? this.authorizedSnapshot(receipt, authority) : void 0;
      if (!receipt || !authorized) continue;
      output.push(authorized);
      if (next.depth < maxDepth) for (const child of receipt.childInvocationIds) queue.push({ id: child, depth: next.depth + 1 });
      else if (receipt.childInvocationIds.length) truncated = true;
    }
    if (queue.length) truncated = true;
    return deepFreeze({ root: this.authorizedSnapshot(root, authority), receipts: output, truncated });
  }
  registration(event) {
    this.append(deepFreeze(omitUndefined({ schemaVersion: 1, eventId: `event_${crypto.randomUUID()}`, sequence: ++this.sequence, ...event })));
  }
  subscribe(observer) {
    this.subscribers.add(observer);
    this.subscriberQueues.set(observer, []);
    return () => {
      this.subscribers.delete(observer);
      this.subscriberQueues.delete(observer);
    };
  }
  subscribeProgress(observer) {
    this.progressObservers.add(observer);
    return () => {
      this.progressObservers.delete(observer);
      this.progressQueues.delete(observer);
    };
  }
  progress(event) {
    const bounded2 = deepFreeze(omitUndefined({ ...event, ...event.message !== void 0 ? { message: event.message.slice(0, 1024) } : {} }));
    for (const observer of this.progressObservers) {
      const queue = this.progressQueues.get(observer) ?? [];
      if (!this.progressQueues.has(observer)) this.progressQueues.set(observer, queue);
      if (queue.length >= 128) {
        this.counters.observerDropped += 1;
        continue;
      }
      queue.push(bounded2);
      if (queue.length === 1) queueMicrotask(() => this.drainProgress(observer));
    }
  }
  diagnostics() {
    return deepFreeze({
      eventCount: this.events.length,
      receiptCount: this.receipts.size,
      retainedBytes: this.retainedBytes,
      evictedEvents: this.counters.evictedEvents,
      evictedReceipts: this.counters.evictedReceipts,
      sinkQueued: this.sinkQueue.length,
      sinkDropped: this.counters.sinkDropped,
      sinkFailures: this.counters.sinkFailures,
      outcomeUnknown: this.counters.outcomeUnknown,
      observerDropped: this.counters.observerDropped,
      observerFailures: this.counters.observerFailures
    });
  }
  authorizedSnapshot(receipt, authority) {
    const base = this.snapshot(receipt);
    if (!this.policy.authorizeReceipt?.(authority, base)) return void 0;
    const childInvocationIds = receipt.childInvocationIds.filter((id) => {
      const child = this.receipts.get(id);
      return child ? Boolean(this.policy.authorizeReceipt?.(authority, this.snapshot(child))) : false;
    });
    return deepFreeze({ ...base, childInvocationIds });
  }
  allowLookup(authority) {
    const now = Date.now();
    const rate = this.lookupRates.get(authority);
    if (!rate || now - rate.windowStarted >= 1e3) {
      this.lookupRates.set(authority, { windowStarted: now, count: 1 });
      return true;
    }
    rate.count += 1;
    return rate.count <= 10;
  }
  event(receipt, type, extra = {}) {
    return deepFreeze(omitUndefined({
      schemaVersion: 1,
      eventId: `event_${crypto.randomUUID()}`,
      sequence: ++this.sequence,
      type,
      occurredAt: Date.now(),
      invocationId: receipt.invocationId,
      traceId: receipt.traceId,
      spanId: receipt.spanId,
      parentInvocationId: receipt.parentInvocationId,
      target: receipt.target,
      registrationId: receipt.registrationId,
      generation: receipt.generation,
      contractDigest: receipt.contractDigest,
      externalAudit: receipt.externalAudit,
      ...extra
    }));
  }
  append(event) {
    const bytes = jsonBytes(event);
    if (bytes > MAX_EVENT_BYTES) return;
    this.events.push({ event, bytes });
    this.retainedBytes += bytes;
    while (this.events.length > this.policy.maxEvents || this.retainedBytes > this.policy.maxBytes) {
      const removed = this.events.shift();
      if (!removed) break;
      this.retainedBytes -= removed.bytes;
      this.counters.evictedEvents += 1;
    }
    for (const subscriber of this.subscribers) {
      const queue = this.subscriberQueues.get(subscriber);
      if (queue.length >= 128) {
        this.counters.observerDropped += 1;
        continue;
      }
      queue.push(event);
      if (!this.subscriberActive.has(subscriber)) {
        this.subscriberActive.add(subscriber);
        queueMicrotask(() => void this.drainSubscriber(subscriber));
      }
    }
    if (this.policy.sink && this.policy.mode === "best_effort") this.enqueueSink(event, bytes);
  }
  async drainSubscriber(subscriber) {
    const queue = this.subscriberQueues.get(subscriber);
    if (!queue) {
      this.subscriberActive.delete(subscriber);
      return;
    }
    while (queue.length && this.subscribers.has(subscriber)) {
      try {
        await subscriber(queue.shift());
      } catch {
        this.counters.observerFailures += 1;
      }
    }
    this.subscriberActive.delete(subscriber);
  }
  enqueueSink(event, bytes) {
    if (this.sinkQueue.length >= MAX_SINK_EVENTS || this.sinkQueueBytes + bytes > MAX_SINK_BYTES) {
      this.counters.sinkDropped += 1;
      return;
    }
    this.sinkQueue.push({ event, bytes });
    this.sinkQueueBytes += bytes;
    if (!this.sinkDraining) {
      this.sinkDraining = true;
      queueMicrotask(() => void this.drainSink());
    }
  }
  async drainSink() {
    while (this.sinkQueue.length) {
      const item = this.sinkQueue.shift();
      this.sinkQueueBytes -= item.bytes;
      try {
        await this.policy.sink.append(item.event);
      } catch {
        this.counters.sinkFailures += 1;
      }
    }
    this.sinkDraining = false;
  }
  drainProgress(observer) {
    const queue = this.progressQueues.get(observer);
    if (!queue || !this.progressObservers.has(observer)) return;
    while (queue.length) {
      try {
        observer.emit(queue.shift());
      } catch {
        queue.length = 0;
      }
    }
  }
  evictReceipts() {
    let inspected = 0;
    while (this.receiptOrder.length > this.policy.maxReceipts && inspected < this.receiptOrder.length) {
      const id = this.receiptOrder.shift();
      const receipt = this.receipts.get(id);
      if (receipt && isTerminal(receipt.state)) {
        this.receipts.delete(id);
        this.counters.evictedReceipts += 1;
      } else {
        this.receiptOrder.push(id);
        inspected += 1;
      }
    }
  }
};
function jsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return MAX_EVENT_BYTES + 1;
  }
}
function isTerminal(state) {
  return state === "rejected" || state === "succeeded" || state === "failed" || state === "cancelled";
}
function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== void 0));
}
function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("audit timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// packages/pi-protocol/control.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
var PRINCIPAL_MARK = /* @__PURE__ */ Symbol.for("@kybernetria/pi-protocol.principal.v1");
var storage = new AsyncLocalStorage2();
function mintProtocolPrincipal(id, kind = "host") {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(id)) throw new Error("Invalid protocol principal id");
  const principal = { id, kind };
  Object.defineProperty(principal, PRINCIPAL_MARK, { value: true });
  return Object.freeze(principal);
}
function isProtocolPrincipal(value) {
  return typeof value === "object" && value !== null && value[PRINCIPAL_MARK] === true && Object.isFrozen(value);
}
function getInvocationControl() {
  return storage.getStore();
}
function runWithInvocationControl(state, callback) {
  return storage.run(state, callback);
}
function targetAllowed(grant, target) {
  return grant.targets.some((pattern) => pattern === "*" || pattern === target || pattern.endsWith(".*") && target.startsWith(pattern.slice(0, -1)));
}
function effectsAllowed(grant, effects) {
  if (!grant.effects) return true;
  const allowed = new Set(grant.effects);
  return effects.every((effect) => allowed.has(effect));
}
function createHandlerInvocationContext(nodeId, provide, trace) {
  const control = storage.getStore();
  if (!control) {
    return { nodeId, provide, ...trace };
  }
  const remainingBudget = Object.freeze({
    maxDepth: control.maxDepth,
    remainingDepth: Math.max(0, control.maxDepth - control.depth),
    remainingInvocations: Math.max(0, Math.min(...control.scopeBudgets.map((budget) => budget.remainingInvocations)))
  });
  return {
    nodeId,
    provide,
    ...trace,
    invocationId: control.invocationId,
    contractDigest: control.contractDigest,
    signal: control.signal,
    abortSignal: control.signal,
    deadline: control.deadline,
    principal: control.principal,
    remainingBudget,
    invoke: control.invokeChild,
    progress: control.progress
  };
}
function intersectGrant(parent, requested) {
  if (!requested) return parent;
  const targets = requested.targets.filter((target) => parent.targets.some(
    (allowed) => allowed === "*" || allowed === target || allowed.endsWith(".*") && target.startsWith(allowed.slice(0, -1))
  ));
  const effects = parent.effects ? (requested.effects ?? parent.effects).filter((effect) => parent.effects.includes(effect)) : requested.effects;
  return Object.freeze({
    targets: Object.freeze([...new Set(targets)]),
    ...effects ? { effects: Object.freeze([...new Set(effects)]) } : {},
    maxDepth: Math.min(parent.maxDepth ?? 8, requested.maxDepth ?? parent.maxDepth ?? 8),
    maxInvocations: Math.min(parent.maxInvocations ?? 64, requested.maxInvocations ?? parent.maxInvocations ?? 64)
  });
}

// packages/pi-protocol/deadline-timer.ts
var MAX_TIMER_DELAY_MS = 2147483647;
function scheduleDeadline(deadline, onDeadline) {
  let timer;
  let disposed = false;
  const arm = () => {
    if (disposed) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      onDeadline();
      return;
    }
    timer = setTimeout(() => {
      timer = void 0;
      arm();
    }, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };
  arm();
  return () => {
    disposed = true;
    if (timer !== void 0) clearTimeout(timer);
  };
}

// packages/pi-protocol/invocation-limiter.ts
var InvocationLimiter = class {
  constructor(maximum, maximumQueue) {
    this.maximum = maximum;
    this.maximumQueue = maximumQueue;
  }
  maximum;
  maximumQueue;
  active = 0;
  queue = [];
  acquire(signal, deadline) {
    if (signal?.aborted) return Promise.reject(controlError("CANCELLED", "Invocation cancelled while waiting"));
    if (Date.now() >= deadline) return Promise.reject(controlError("DEADLINE_EXCEEDED", "Invocation deadline exceeded while waiting"));
    if (this.active < this.maximum) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.queue.length >= this.maximumQueue) return Promise.reject(controlError("OVERLOADED", "Invocation queue is full"));
    return new Promise((resolve5, reject) => {
      const waiter = { resolve: resolve5, reject, signal, deadline };
      const remove = () => {
        const index = this.queue.indexOf(waiter);
        if (index >= 0) this.queue.splice(index, 1);
      };
      const cleanup = () => {
        remove();
        waiter.deadlineDisposer?.();
        signal?.removeEventListener("abort", waiter.onAbort);
      };
      waiter.onAbort = () => {
        cleanup();
        reject(controlError("CANCELLED", "Invocation cancelled while waiting"));
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.queue.push(waiter);
      if (Number.isFinite(deadline)) {
        waiter.deadlineDisposer = scheduleDeadline(deadline, () => {
          cleanup();
          reject(controlError("DEADLINE_EXCEEDED", "Invocation deadline exceeded while waiting"));
        });
      }
    });
  }
  diagnostics() {
    return { active: this.active, queued: this.queue.length };
  }
  releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.dispatch();
    };
  }
  dispatch() {
    while (this.active < this.maximum && this.queue.length) {
      const waiter = this.queue.shift();
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.deadlineDisposer?.();
      if (waiter.signal?.aborted) {
        waiter.reject(controlError("CANCELLED", "Invocation cancelled while waiting"));
        continue;
      }
      if (Date.now() >= waiter.deadline) {
        waiter.reject(controlError("DEADLINE_EXCEEDED", "Invocation deadline exceeded while waiting"));
        continue;
      }
      this.active += 1;
      waiter.resolve(this.releaseOnce());
    }
  }
};
function controlError(code, message2) {
  return Object.assign(new Error(message2), { code });
}

// packages/pi-protocol/context.ts
import { AsyncLocalStorage as AsyncLocalStorage3 } from "node:async_hooks";
var invocationContextStorage = new AsyncLocalStorage3();
function getCurrentProtocolInvocationContext() {
  return invocationContextStorage.getStore();
}
function runWithProtocolInvocationContext(request, provenance, callback) {
  const parent = invocationContextStorage.getStore();
  const context = {
    nodeId: request.nodeId,
    provide: request.provide,
    traceId: provenance.traceId,
    spanId: provenance.spanId,
    parentSpanId: provenance.parentSpanId,
    callerNodeId: provenance.callerNodeId,
    session: request.session,
    abortSignal: request.abortSignal ?? parent?.abortSignal,
    registrationId: provenance.registrationId,
    registrationGeneration: provenance.registrationGeneration,
    childCounter: 0
  };
  return runWithProtocolInvocationContextValue(context, callback);
}
function runWithProtocolInvocationContextValue(context, callback) {
  return invocationContextStorage.run(context, callback);
}

// packages/pi-protocol/execution.ts
async function executeAdmittedProvide(input) {
  if (input.request.abortSignal?.aborted) {
    return { ok: false, error: { code: "CANCELLED", message: "Invocation cancelled" } };
  }
  const inputValidation = input.provide.validateInput(input.request.input);
  if (!inputValidation.valid) {
    return { ok: false, error: { code: "INPUT_INVALID", message: formatContractIssue("input", inputValidation.issues[0]) } };
  }
  const controlled = createHandlerInvocationContext(input.request.nodeId, input.request.provide, input.provenance);
  const context = {
    ...controlled,
    session: input.request.session,
    abortSignal: controlled.signal ?? input.request.abortSignal,
    emitExecutionEvent: input.emitExecutionEvent
  };
  try {
    const output = await input.binding(input.request.input, context);
    const outputValidation = input.provide.validateOutput(output);
    if (!outputValidation.valid) {
      return { ok: false, error: { code: "OUTPUT_INVALID", message: formatContractIssue("output", outputValidation.issues[0]) } };
    }
    return { ok: true, nodeId: input.request.nodeId, provide: input.request.provide, output };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: isAbortError(error) ? "CANCELLED" : "EXECUTION_FAILED",
        message: isAbortError(error) ? "Invocation cancelled" : error instanceof Error ? error.message : String(error)
      }
    };
  }
}
function formatContractIssue(boundary, issue2) {
  if (!issue2) return `${boundary} does not satisfy the protocol contract`;
  return `${boundary}${issue2.path || ""} ${issue2.message}`;
}
function isAbortError(error) {
  return error instanceof Error && (error.name === "AbortError" || error.message === "Invocation aborted");
}

// packages/pi-protocol/fabric.ts
var FABRIC_VERSION_KEY = /* @__PURE__ */ Symbol.for("@kybernetria/pi-protocol.fabric.abi");
var FABRIC_VERSION = 10;
var HOST_ABI_KEY = /* @__PURE__ */ Symbol.for("@kybernetria/pi-protocol.host.v1");
var HOST_ABI_VERSION = 2;
function createProtocolFabric(options = {}) {
  const nodes = /* @__PURE__ */ new Map();
  const searchCatalog = /* @__PURE__ */ new Map();
  const drainingNodes = /* @__PURE__ */ new Set();
  const publishNode = (entry) => {
    nodes.set(entry.node.nodeId, entry);
    searchCatalog.set(entry.node.nodeId, buildSearchCatalog(entry.node));
  };
  const removeNode = (nodeId) => {
    nodes.delete(nodeId);
    searchCatalog.delete(nodeId);
  };
  const executionSubscribers = /* @__PURE__ */ new Set();
  const audit = new AuditLedger(options.audit);
  const principals = /* @__PURE__ */ new WeakSet();
  const systemPrincipal = mintProtocolPrincipal("system:local", "system");
  principals.add(systemPrincipal);
  const defaultDeadlineMs = options.defaultDeadlineMs === void 0 ? Number.POSITIVE_INFINITY : boundedInteger(options.defaultDeadlineMs, 3e4, 10, Number.MAX_SAFE_INTEGER, "defaultDeadlineMs");
  const limiter = new InvocationLimiter(
    boundedInteger(options.maxConcurrentInvocations, 32, 1, 1024, "maxConcurrentInvocations"),
    boundedInteger(options.maxQueuedInvocations, 128, 0, 4096, "maxQueuedInvocations")
  );
  const confirmationEffects = new Set(options.confirmationRequiredEffects ?? ["external.transaction", "system.configure"]);
  const emitRegistration = (event) => {
    audit.registration({
      type: event.type,
      occurredAt: event.timestamp,
      registrationId: event.registrationId,
      nodeId: event.nodeId,
      generation: event.generation,
      contractDigest: event.contractDigest,
      previousContractDigest: event.previousContractDigest,
      packageId: event.metadata?.packageId,
      packageVersion: event.metadata?.packageVersion,
      outcomeCode: event.error?.code
    });
  };
  const prepareAtomicRegistration = (definition, bindings, registrationId, generation, metadata) => {
    if (!isAdmittedProtocolDefinition(definition)) throw registrationError("INVALID_DEFINITION", "Definition was not admitted by the canonical contract parser");
    const provideNames = definition.manifest.provides.map((provide) => provide.name);
    const handlers = bindings.handlers ?? {};
    const agents = bindings.agents ?? {};
    assertBindingRecord(handlers, "handlers");
    assertBindingRecord(agents, "agents");
    if (bindings.dispose !== void 0 && typeof bindings.dispose !== "function") throw registrationError("INVALID_BINDINGS", "bindings.dispose must be a function");
    const supplied = /* @__PURE__ */ new Set([...Object.keys(handlers), ...Object.keys(agents)]);
    for (const name2 of provideNames) {
      const handler = Object.hasOwn(handlers, name2) ? handlers[name2] : void 0;
      const agent = Object.hasOwn(agents, name2) ? agents[name2] : void 0;
      if ((typeof handler === "function" ? 1 : 0) + (typeof agent === "function" ? 1 : 0) !== 1) {
        throw registrationError("INVALID_BINDINGS", `Provide ${definition.manifest.node.id}.${name2} must have exactly one binding`);
      }
      supplied.delete(name2);
    }
    if (supplied.size > 0) throw registrationError("INVALID_BINDINGS", "Registration contains bindings that are not declared provides");
    const bindingsByProvide = /* @__PURE__ */ Object.create(null);
    const runtimeHandlers = /* @__PURE__ */ Object.create(null);
    const runtimeAgents = /* @__PURE__ */ Object.create(null);
    const provides = definition.manifest.provides.map((provide) => {
      const kind = Object.hasOwn(handlers, provide.name) && typeof handlers[provide.name] === "function" ? "handler" : "agent";
      const binding = kind === "handler" ? handlers[provide.name] : agents[provide.name];
      bindingsByProvide[provide.name] = binding;
      if (kind === "handler") runtimeHandlers[provide.name] = binding;
      else runtimeAgents[provide.name] = binding;
      return {
        name: provide.name,
        description: provide.description,
        inputSchema: provide.inputSchema,
        outputSchema: provide.outputSchema,
        execution: kind === "handler" ? { type: "handler", handler: provide.name } : { type: "agent", agent: provide.name },
        ...provide.tags ? { tags: [...provide.tags] } : {},
        ...provide.effects ? { effects: [...provide.effects] } : {}
      };
    });
    return {
      node: freezeSnapshot({
        nodeId: definition.manifest.node.id,
        purpose: definition.manifest.node.purpose,
        ...definition.manifest.node.tags ? { tags: [...definition.manifest.node.tags] } : {},
        provides
      }),
      handlers: runtimeHandlers,
      agentExecutors: runtimeAgents,
      definition,
      bindingsByProvide: Object.freeze(bindingsByProvide),
      registrationId,
      generation,
      contractDigest: definition.contractDigest,
      metadata: metadata ? freezeSnapshot({ ...metadata }) : void 0,
      inFlight: 0,
      draining: false,
      disposed: false,
      disposeBindings: bindings.dispose
    };
  };
  const performAuditedInvocation = async (request) => {
    try {
      request = snapshotInvokeRequest(request);
    } catch {
      const receipt2 = audit.createReceipt({ traceId: createId("trace"), spanId: createId("span"), target: "invalid.invalid" });
      audit.reject(receipt2, "INPUT_INVALID");
      const result = { ok: false, error: { code: "INPUT_INVALID", message: "Invocation request must contain ordinary data fields" } };
      return audit.trackedResult(result, receipt2);
    }
    const canonicalTraceId = createId("trace");
    const canonicalSpanId = createId("span");
    const safeTarget = validTargetPart(request.nodeId) && validTargetPart(request.provide) ? `${request.nodeId}.${request.provide}` : "invalid.invalid";
    const receipt = audit.createReceipt({ traceId: canonicalTraceId, spanId: canonicalSpanId, target: safeTarget });
    let releaseSlot;
    let releaseControlSignal;
    const reject = (code, message2) => {
      releaseSlot?.();
      releaseSlot = void 0;
      releaseControlSignal?.();
      releaseControlSignal = void 0;
      audit.reject(receipt, code);
      const error = { code, message: message2 };
      const result = { ok: false, error };
      return audit.trackedResult(result, receipt);
    };
    if (safeTarget === "invalid.invalid") return reject("INVALID_TARGET", "Invalid protocol target");
    const parentControl = getInvocationControl();
    const grant = parentControl?.grant ?? Object.freeze({ targets: Object.freeze(["*"]), maxDepth: 8, maxInvocations: 64 });
    const rootBudget = parentControl?.rootBudget ?? { remainingInvocations: grant.maxInvocations ?? 64 };
    const scopeBudgets = parentControl?.scopeBudgets ?? [rootBudget];
    const depth = (parentControl?.depth ?? -1) + 1;
    const maxDepth = Math.min(parentControl?.maxDepth ?? 8, grant.maxDepth ?? 8);
    const deadline = Math.min(parentControl?.deadline ?? Number.POSITIVE_INFINITY, Date.now() + defaultDeadlineMs);
    const combined = combineInvocationSignals(parentControl?.signal, request.abortSignal, deadline);
    releaseControlSignal = combined.dispose;
    if (combined.signal.aborted) return reject(Date.now() >= deadline ? "DEADLINE_EXCEEDED" : "CANCELLED", "Invocation unavailable before execution");
    if (depth > maxDepth || scopeBudgets.some((budget) => budget.remainingInvocations <= 0)) return reject("OVERLOADED", "Invocation budget exhausted");
    if (!targetAllowed(grant, safeTarget)) return reject("FORBIDDEN", `Protocol grant denies target ${safeTarget}`);
    for (const budget of new Set(scopeBudgets)) budget.remainingInvocations -= 1;
    try {
      releaseSlot = await limiter.acquire(combined.signal, deadline);
    } catch (error) {
      const code = controlErrorCode(error);
      return reject(code, error instanceof Error ? error.message : "Invocation admission failed");
    }
    const selected = nodes.get(request.nodeId);
    if (!selected) return reject("NOT_FOUND", `Node not found: ${request.nodeId}`);
    const provide = selected.node.provides.find((candidate) => candidate.name === request.provide);
    if (!provide) return reject("NOT_FOUND", `Provide not found: ${safeTarget}`);
    try {
      const input = normalizeJsonValue(assertBoundedJsonValue(request.input, PROTOCOL_CONTRACT_LIMITS));
      request = { ...request, input };
    } catch {
      return reject("INPUT_INVALID", "Input must be a bounded strict JSON value");
    }
    const effects = provide.effects ?? [];
    if (!effectsAllowed(grant, effects)) return reject("FORBIDDEN", `Protocol grant denies effects for ${safeTarget}`);
    const compiled = selected.definition.provides[request.provide];
    if (!compiled.validateInput(request.input).valid) return reject("INPUT_INVALID", "Input does not satisfy the protocol contract");
    selected.inFlight += 1;
    audit.bind(receipt, selected);
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        releaseRegisteredNode(selected);
        releaseSlot?.();
        releaseSlot = void 0;
        releaseControlSignal?.();
        releaseControlSignal = void 0;
      }
    };
    const requiresConfirmation = provide.policy?.confirmation === "required" || effects.some((effect) => confirmationEffects.has(effect));
    if (requiresConfirmation) {
      audit.approval(receipt, "requested");
      if (!options.confirmationBroker) {
        audit.approval(receipt, "denied");
        release();
        return reject("CONFIRMATION_REQUIRED", `Host confirmation is required for ${safeTarget}`);
      }
      let approved = false;
      try {
        approved = await waitForConfirmation(Promise.resolve(options.confirmationBroker.confirm({
          principal: parentControl?.principal ?? systemPrincipal,
          target: safeTarget,
          contractDigest: selected.contractDigest,
          inputDigest: digestJson(request.input),
          effects,
          expiresAt: deadline
        })), combined.signal, deadline);
      } catch {
        approved = false;
      }
      if (!approved) {
        audit.approval(receipt, "denied");
        release();
        if (combined.signal.aborted) return reject(Date.now() >= deadline ? "DEADLINE_EXCEEDED" : "CANCELLED", "Confirmation did not complete before invocation expiry");
        return reject("CONFIRMATION_DENIED", `Host confirmation denied ${safeTarget}`);
      }
      audit.approval(receipt, "approved");
      if (Date.now() >= deadline || combined.signal.aborted) {
        release();
        return reject(Date.now() >= deadline ? "DEADLINE_EXCEEDED" : "CANCELLED", "Invocation expired before dispatch");
      }
    }
    const auditAccepted = await audit.start(receipt, jsonBytes(request.input));
    if (!auditAccepted) {
      release();
      return reject("AUDIT_UNAVAILABLE", "Required audit sink unavailable");
    }
    if (combined.signal.aborted) {
      audit.cancelRequested(receipt);
      release();
      return reject(Date.now() >= deadline ? "DEADLINE_EXCEEDED" : "CANCELLED", "Invocation unavailable before dispatch");
    }
    let controlState;
    const invokeChild = async (target, input, childOptions) => {
      const parsed = parseTarget(target);
      if (!parsed || !validChildOptions(childOptions)) return performAuditedInvocation({ nodeId: "invalid", provide: "invalid", input });
      const childGrant = intersectGrant(grant, childOptions?.grant);
      const childDeadline = Math.min(deadline, childOptions?.deadline ?? deadline);
      const childCombined = combineInvocationSignals(combined.signal, childOptions?.signal, childDeadline);
      const childScopes = childOptions?.grant ? [...scopeBudgets, { remainingInvocations: Math.min(childGrant.maxInvocations ?? 64, ...scopeBudgets.map((budget) => budget.remainingInvocations)) }] : scopeBudgets;
      const seed = {
        ...controlState,
        grant: childGrant,
        deadline: childDeadline,
        signal: childCombined.signal,
        depth,
        scopeBudgets: childScopes
      };
      const resume = controlState.suspendConcurrency ? await controlState.suspendConcurrency() : async () => void 0;
      try {
        return await runWithInvocationControl(seed, () => performAuditedInvocation({ nodeId: parsed.nodeId, provide: parsed.provide, input, abortSignal: childCombined.signal }));
      } finally {
        childCombined.dispose();
        await resume();
      }
    };
    controlState = {
      principal: parentControl?.principal ?? systemPrincipal,
      grant,
      depth,
      deadline,
      signal: combined.signal,
      rootBudget,
      scopeBudgets,
      maxDepth,
      suspendConcurrency: async () => {
        const held = releaseSlot;
        if (held) {
          held();
          releaseSlot = void 0;
        }
        let resumed = false;
        return async () => {
          if (resumed || !held || released) return;
          resumed = true;
          const reacquired = await limiter.acquire(combined.signal, deadline);
          if (released) reacquired();
          else releaseSlot = reacquired;
        };
      },
      invocationId: receipt.invocationId,
      callingTarget: safeTarget,
      contractDigest: selected.contractDigest,
      invokeChild,
      progress: (event) => audit.progress({ schemaVersion: 1, invocationId: receipt.invocationId, sequence: Date.now(), ...event })
    };
    audit.dispatched(receipt);
    const executionRequest = {
      nodeId: request.nodeId,
      provide: request.provide,
      input: request.input,
      traceId: request.traceId ?? canonicalTraceId,
      spanId: request.spanId ?? canonicalSpanId,
      ...request.parentSpanId ? { parentSpanId: request.parentSpanId } : {},
      ...request.callerNodeId ? { callerNodeId: request.callerNodeId } : {},
      ...request.session ? { session: request.session } : {},
      abortSignal: combined.signal
    };
    const actual = runWithInvocationControl(
      controlState,
      () => audit.runWithReceipt(receipt.invocationId, () => executePinned(selected, provide, executionRequest))
    );
    const settled = Promise.resolve(actual).catch(() => ({ ok: false, error: { code: "EXECUTION_FAILED", message: "Invocation pipeline failed" } })).then((result) => {
      audit.settle(receipt, result);
      release();
      return audit.trackedResult(result, receipt);
    });
    let removeAbort = () => void 0;
    const cancellation = new Promise((resolve5) => {
      const onAbort = () => resolve5("cancel");
      combined.signal.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => combined.signal.removeEventListener("abort", onAbort);
      if (combined.signal.aborted) resolve5("cancel");
    });
    const raced = await Promise.race([settled, cancellation]);
    removeAbort();
    if (raced !== "cancel") return raced;
    audit.cancelRequested(receipt);
    audit.outcomeUnknown(receipt);
    void settled.catch(() => void 0);
    const unknown = { ok: false, error: { code: "OUTCOME_UNKNOWN", message: "Caller stopped waiting; execution outcome remains unknown" } };
    return audit.trackedResult(unknown, receipt);
  };
  const executePinned = async (registered, provide, request) => {
    const provenance = {
      traceId: request.traceId ?? createId("trace"),
      spanId: request.spanId ?? createId("span"),
      parentSpanId: request.parentSpanId,
      callerNodeId: request.callerNodeId,
      registrationId: registered.registrationId,
      registrationGeneration: registered.generation,
      contractDigest: registered.contractDigest
    };
    const canonicalProvide = registered.definition.provides[request.provide];
    const canonicalBinding = registered.bindingsByProvide[request.provide];
    return runWithProtocolInvocationContext(
      request,
      provenance,
      () => executeAdmittedProvide({ request, provenance, provide: canonicalProvide, binding: canonicalBinding, emitExecutionEvent: createExecutionEventEmitter(executionSubscribers) })
    );
  };
  const fabric = {
    subscribeAudit(observer) {
      return audit.subscribe(observer);
    },
    subscribeProgress(observer) {
      return audit.subscribeProgress(observer);
    },
    subscribeExecution(observer) {
      executionSubscribers.add(observer);
      return createUnsubscribe(executionSubscribers, observer);
    },
    auditDiagnostics() {
      return audit.diagnostics();
    },
    diagnostics() {
      return freezeSnapshot({
        registrations: [...nodes.values(), ...drainingNodes].map((entry) => ({
          nodeId: entry.node.nodeId,
          registrationId: entry.registrationId,
          generation: entry.generation,
          contractDigest: entry.contractDigest,
          ...entry.metadata?.packageId ? { packageId: entry.metadata.packageId } : {},
          ...entry.metadata?.packageVersion ? { packageVersion: entry.metadata.packageVersion } : {},
          ...entry.metadata?.sourcePath ? { sourcePath: entry.metadata.sourcePath } : {},
          ...entry.metadata?.buildId ? { buildId: entry.metadata.buildId } : {},
          inFlight: entry.inFlight,
          draining: entry.draining
        })),
        admission: limiter.diagnostics()
      });
    },
    getReceipt(invocationId, authority) {
      return audit.getReceipt(invocationId, authority);
    },
    lookupCausalProvenance(invocationId, authority, lookupOptions) {
      return audit.causal(invocationId, authority, lookupOptions);
    },
    invokeTracked(request) {
      return performAuditedInvocation(request);
    },
    mintPrincipal(id, kind) {
      const principal = mintProtocolPrincipal(id, kind);
      principals.add(principal);
      return principal;
    },
    invokeAs(principal, target, input, invokeOptions) {
      if (!isProtocolPrincipal(principal) || !principals.has(principal)) {
        return performAuditedInvocation({ nodeId: "invalid", provide: "invalid", input });
      }
      const parsed = parseTarget(target);
      if (!parsed || !validGrant(invokeOptions?.grant)) {
        return performAuditedInvocation({ nodeId: "invalid", provide: "invalid", input });
      }
      const grant = intersectGrant(Object.freeze({ targets: Object.freeze(["*"]), maxDepth: 32, maxInvocations: 1024 }), invokeOptions.grant);
      const requestedDeadline = invokeOptions.deadline;
      if (requestedDeadline !== void 0 && !Number.isFinite(requestedDeadline)) {
        return performAuditedInvocation({ nodeId: "invalid", provide: "invalid", input });
      }
      const deadline = requestedDeadline ?? Number.POSITIVE_INFINITY;
      const combined = combineInvocationSignals(invokeOptions.signal, void 0, deadline);
      const rootBudget = { remainingInvocations: grant.maxInvocations ?? 64 };
      const seed = {
        principal,
        grant,
        depth: -1,
        deadline,
        signal: combined.signal,
        rootBudget,
        scopeBudgets: [rootBudget],
        maxDepth: grant.maxDepth ?? 8,
        invokeChild: () => Promise.reject(new Error("No active invocation")),
        progress: () => void 0
      };
      return runWithInvocationControl(seed, () => performAuditedInvocation({
        nodeId: parsed.nodeId,
        provide: parsed.provide,
        input,
        abortSignal: combined.signal
      })).finally(combined.dispose);
    },
    install(definition, bindings, metadata) {
      const registrationId = createId("registration");
      const nodeId = safeDefinitionNodeId(definition);
      let normalizedMetadata;
      try {
        normalizedMetadata = normalizeRegistrationMetadata(metadata);
      } catch (error) {
        emitRegistration(rejectedRegistrationEvent(registrationId, nodeId, definition, error));
        throw error;
      }
      emitRegistration({ type: "registration.requested", timestamp: Date.now(), registrationId, nodeId, contractDigest: safeDefinitionDigest(definition), metadata: normalizedMetadata });
      let entry;
      try {
        entry = prepareAtomicRegistration(definition, bindings, registrationId, 1, normalizedMetadata);
        if (nodes.has(entry.node.nodeId)) throw registrationError("CONFLICT", `Node already registered: ${entry.node.nodeId}`);
      } catch (error) {
        emitRegistration(rejectedRegistrationEvent(registrationId, nodeId, definition, error, normalizedMetadata));
        throw error;
      }
      publishNode(entry);
      emitRegistration({
        type: "registration.installed",
        timestamp: Date.now(),
        registrationId,
        nodeId: entry.node.nodeId,
        generation: 1,
        contractDigest: entry.contractDigest,
        metadata: entry.metadata
      });
      let active = true;
      let current = entry;
      const lease = {
        registrationId,
        nodeId: entry.node.nodeId,
        get generation() {
          return current.generation;
        },
        get contractDigest() {
          return current.contractDigest;
        },
        async replace(nextDefinition, nextBindings) {
          if (!active) throw registrationError("CONFLICT", "Registration lease is disposed");
          assertNotSelfLifecycle(registrationId, current.generation);
          const nextGeneration = current.generation + 1;
          emitRegistration({
            type: "registration.requested",
            timestamp: Date.now(),
            registrationId,
            nodeId: current.node.nodeId,
            generation: nextGeneration,
            contractDigest: safeDefinitionDigest(nextDefinition),
            metadata: current.metadata
          });
          let replacement;
          try {
            replacement = prepareAtomicRegistration(nextDefinition, nextBindings, registrationId, nextGeneration, current.metadata);
            if (replacement.node.nodeId !== current.node.nodeId) throw registrationError("CONTRACT_CHANGED", "Replacement cannot change node identity");
            if (nodes.get(current.node.nodeId) !== current) throw registrationError("CONFLICT", "Registration is no longer active");
          } catch (error) {
            emitRegistration(rejectedRegistrationEvent(registrationId, current.node.nodeId, nextDefinition, error, current.metadata));
            throw error;
          }
          const previous = current;
          publishNode(replacement);
          current = replacement;
          emitRegistration({
            type: "registration.replaced",
            timestamp: Date.now(),
            registrationId,
            nodeId: replacement.node.nodeId,
            generation: nextGeneration,
            contractDigest: replacement.contractDigest,
            previousContractDigest: previous.contractDigest,
            metadata: replacement.metadata
          });
          drainingNodes.add(previous);
          try {
            await drainRegisteredNode(previous);
          } finally {
            drainingNodes.delete(previous);
          }
        },
        async dispose() {
          if (!active) return;
          assertNotSelfLifecycle(registrationId, current.generation);
          active = false;
          if (nodes.get(current.node.nodeId) === current) removeNode(current.node.nodeId);
          emitRegistration({
            type: "registration.removed",
            timestamp: Date.now(),
            registrationId,
            nodeId: current.node.nodeId,
            generation: current.generation,
            contractDigest: current.contractDigest,
            metadata: current.metadata
          });
          drainingNodes.add(current);
          try {
            await drainRegisteredNode(current);
          } finally {
            drainingNodes.delete(current);
          }
        }
      };
      return Object.freeze(lease);
    },
    registry() {
      const registeredNodes = [...nodes.values()].map((entry) => cloneProtocolNodeWithAllowedProvides(entry.node)).filter((node) => node.provides.length > 0);
      return freezeSnapshot({
        nodes: registeredNodes,
        provides: registeredNodes.flatMap((node) => node.provides.map((provide) => createProvideSnapshot(node, provide.name)))
      });
    },
    search(query, searchOptions = {}) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 32);
      const limit = boundedInteger(searchOptions.limit, 12, 1, 50, "search limit");
      const matches = [];
      const control = getInvocationControl();
      for (const [nodeId, entries] of searchCatalog) {
        const registered = nodes.get(nodeId);
        if (!registered) continue;
        for (const catalogEntry of entries) {
          const provide = registered.node.provides[catalogEntry.provideIndex];
          if (!provide || provide.name !== catalogEntry.provideName) continue;
          if (control && (!targetAllowed(control.grant, `${nodeId}.${provide.name}`) || !effectsAllowed(control.grant, provide.effects ?? []))) continue;
          if (searchOptions.tags?.length && !searchOptions.tags.every((tag) => provide.tags?.includes(tag))) continue;
          if (searchOptions.effects?.length && !searchOptions.effects.every((effect) => provide.effects?.includes(effect))) continue;
          const score = terms.reduce((total, term) => total + (catalogEntry.searchText.includes(term) ? 1 : 0), 0);
          if (terms.length && score === 0) continue;
          matches.push({ score, node: registered.node, provide });
        }
      }
      matches.sort((left, right) => right.score - left.score || left.node.nodeId.localeCompare(right.node.nodeId) || left.provide.name.localeCompare(right.provide.name));
      return freezeSnapshot({
        totalMatches: matches.length,
        provides: matches.slice(0, limit).map((match) => createProvideSnapshotFromProvide(match.node, match.provide))
      });
    },
    describeNode(nodeId) {
      const node = nodes.get(nodeId)?.node;
      if (!node) return void 0;
      const filtered = cloneProtocolNodeWithAllowedProvides(node);
      return filtered.provides.length > 0 ? freezeSnapshot(filtered) : void 0;
    },
    describeProvide(nodeId, provideName) {
      const control = getInvocationControl();
      if (control && !targetAllowed(control.grant, `${nodeId}.${provideName}`)) return void 0;
      const node = nodes.get(nodeId)?.node;
      const provide = node?.provides.find((item) => item.name === provideName);
      if (!node || !provide || control && !effectsAllowed(control.grant, provide.effects ?? [])) return void 0;
      return freezeSnapshot({
        ...cloneProvide(provide),
        nodeId: node.nodeId,
        globalId: `${node.nodeId}.${provide.name}`
      });
    }
  };
  Object.defineProperty(fabric, FABRIC_VERSION_KEY, { value: FABRIC_VERSION });
  return fabric;
}
function ensureProtocolFabric(options = {}) {
  const globals = globalThis;
  const host = globals[HOST_ABI_KEY];
  if (host !== void 0) {
    if (!isCompatibleHost(host)) throw new Error("Incompatible Pi Protocol host ABI is already installed");
    recordRuntimeCopy(host);
    return host.fabric;
  }
  const fabric = createProtocolFabric(options);
  globals[HOST_ABI_KEY] = {
    abiVersion: HOST_ABI_VERSION,
    fabric,
    runtimeCopies: [{ moduleUrl: import.meta.url, packageVersion: package_default.version }]
  };
  return fabric;
}
function getProtocolHostDiagnostics() {
  const host = globalThis[HOST_ABI_KEY];
  if (!isCompatibleHost(host)) return void 0;
  return freezeSnapshot({ abiVersion: host.abiVersion, runtimeCopies: host.runtimeCopies.map((copy) => ({ ...copy })) });
}
function isCompatibleProtocolFabric(value) {
  return Boolean(value) && value[FABRIC_VERSION_KEY] === FABRIC_VERSION && typeof value?.subscribeAudit === "function" && typeof value.subscribeProgress === "function" && typeof value.subscribeExecution === "function" && typeof value.auditDiagnostics === "function" && typeof value.diagnostics === "function" && typeof value.getReceipt === "function" && typeof value.lookupCausalProvenance === "function" && typeof value.invokeTracked === "function" && typeof value.mintPrincipal === "function" && typeof value.invokeAs === "function" && typeof value.install === "function" && !("register" in value) && !("unregister" in value) && typeof value.registry === "function" && typeof value.search === "function" && typeof value.describeNode === "function" && typeof value.describeProvide === "function";
}
function isCompatibleHost(value) {
  return Boolean(value) && value?.abiVersion === HOST_ABI_VERSION && Array.isArray(value.runtimeCopies) && isCompatibleProtocolFabric(value.fabric);
}
function recordRuntimeCopy(host) {
  if (!host.runtimeCopies.some((copy) => copy.moduleUrl === import.meta.url)) {
    host.runtimeCopies.push({ moduleUrl: import.meta.url, packageVersion: package_default.version });
  }
}
function releaseRegisteredNode(entry) {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
  if (entry.draining && entry.inFlight === 0) void finalizeRegisteredNode(entry);
}
function drainRegisteredNode(entry) {
  if (entry.drainPromise) return entry.drainPromise;
  entry.draining = true;
  entry.drainPromise = new Promise((resolve5, reject) => {
    entry.resolveDrain = resolve5;
    entry.rejectDrain = reject;
  });
  if (entry.inFlight === 0) void finalizeRegisteredNode(entry);
  return entry.drainPromise;
}
async function finalizeRegisteredNode(entry) {
  if (entry.disposed) return;
  entry.disposed = true;
  try {
    await entry.disposeBindings?.();
    entry.resolveDrain?.();
  } catch (error) {
    entry.rejectDrain?.(error);
  }
}
function assertBindingRecord(value, label) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length > 0) {
    throw registrationError("INVALID_BINDINGS", `${label} must be an ordinary string-keyed record`);
  }
  for (const name2 of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name2);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "function") {
      throw registrationError("INVALID_BINDINGS", `${label} must contain only enumerable callable data properties`);
    }
  }
}
function normalizeRegistrationMetadata(metadata) {
  if (metadata === void 0) return void 0;
  const prototype = Object.getPrototypeOf(metadata);
  const allowed = /* @__PURE__ */ new Set(["packageId", "packageVersion", "sourcePath", "buildId"]);
  if (prototype !== Object.prototype && prototype !== null || Reflect.ownKeys(metadata).some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw registrationError("INVALID_DEFINITION", "Registration metadata must be an ordinary object with known fields");
  }
  const result = {};
  let total = 0;
  for (const key of allowed) {
    if (!Object.hasOwn(metadata, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string") {
      throw registrationError("INVALID_DEFINITION", "Registration metadata fields must be enumerable strings");
    }
    const limit = key === "sourcePath" ? 4096 : 512;
    if (Buffer.byteLength(descriptor.value, "utf8") > limit) throw registrationError("INVALID_DEFINITION", "Registration metadata exceeds its size limit");
    total += Buffer.byteLength(descriptor.value, "utf8");
    result[key] = descriptor.value;
  }
  if (total > 8192) throw registrationError("INVALID_DEFINITION", "Registration metadata exceeds its total size limit");
  return Object.freeze(result);
}
function assertNotSelfLifecycle(registrationId, generation) {
  const context = getCurrentProtocolInvocationContext();
  if (context?.registrationId === registrationId && context.registrationGeneration === generation) {
    throw registrationError("CONFLICT", "A provide cannot replace or dispose its own active registration generation");
  }
}
function registrationError(code, message2) {
  return Object.assign(new Error(message2), { code });
}
function rejectedRegistrationEvent(registrationId, nodeId, definition, error, metadata) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "INVALID_DEFINITION";
  const stableCode = ["CONFLICT", "CONTRACT_CHANGED", "INVALID_BINDINGS", "INVALID_DEFINITION"].find((item) => item === code) ?? "INVALID_DEFINITION";
  return {
    type: "registration.rejected",
    timestamp: Date.now(),
    registrationId,
    nodeId,
    contractDigest: safeDefinitionDigest(definition),
    error: { code: stableCode, message: error instanceof Error ? error.message : "Registration rejected" },
    metadata
  };
}
function boundedInteger(value, fallback, minimum, maximum, label) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  return candidate;
}
function parseTarget(target) {
  if (typeof target !== "string") return void 0;
  const separator = target.indexOf(".");
  if (separator <= 0 || separator !== target.lastIndexOf(".")) return void 0;
  const nodeId = target.slice(0, separator);
  const provide = target.slice(separator + 1);
  return validTargetPart(nodeId) && validTargetPart(provide) ? { nodeId, provide } : void 0;
}
function validChildOptions(options) {
  if (options === void 0) return true;
  if (typeof options !== "object" || options === null || Object.getPrototypeOf(options) !== Object.prototype) return false;
  const allowed = /* @__PURE__ */ new Set(["deadline", "grant", "signal"]);
  if (Reflect.ownKeys(options).some((key) => typeof key !== "string" || !allowed.has(key))) return false;
  for (const key of Object.keys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
  }
  return (options.deadline === void 0 || Number.isFinite(options.deadline)) && (options.grant === void 0 || validGrant(options.grant)) && (options.signal === void 0 || typeof options.signal === "object" && typeof options.signal.addEventListener === "function");
}
function validGrant(grant) {
  return Boolean(grant) && Array.isArray(grant?.targets) && grant.targets.length <= 256 && grant.targets.every((target) => target === "*" || /^([a-z0-9][a-z0-9_-]*)(?:\.\*|\.[a-z0-9][a-z0-9_-]*)$/.test(target)) && (grant.effects === void 0 || Array.isArray(grant.effects) && grant.effects.length <= 11 && grant.effects.every((effect) => STANDARD_EFFECTS.includes(effect))) && (grant.maxDepth === void 0 || Number.isInteger(grant.maxDepth) && grant.maxDepth >= 0 && grant.maxDepth <= 32) && (grant.maxInvocations === void 0 || Number.isInteger(grant.maxInvocations) && grant.maxInvocations >= 1 && grant.maxInvocations <= 1024);
}
function combineInvocationSignals(first, second, deadline) {
  const controller = new AbortController();
  const sources = [first, second].filter((signal) => Boolean(signal));
  const onAbort = () => controller.abort();
  for (const source of sources) {
    if (source.aborted) controller.abort();
    else source.addEventListener("abort", onAbort);
  }
  const deadlineDisposer = Number.isFinite(deadline) ? scheduleDeadline(deadline, () => controller.abort()) : void 0;
  return {
    signal: controller.signal,
    dispose: () => {
      deadlineDisposer?.();
      for (const source of sources) source.removeEventListener("abort", onAbort);
    }
  };
}
async function waitForConfirmation(promise, signal, deadline) {
  if (signal.aborted || Date.now() >= deadline) return false;
  return new Promise((resolve5) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve5(value);
    };
    const onAbort = () => finish(false);
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then((value) => finish(value), () => finish(false));
  });
}
function controlErrorCode(error) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (code === "CANCELLED" || code === "DEADLINE_EXCEEDED" || code === "OVERLOADED") return code;
  }
  return "OVERLOADED";
}
function digestJson(value) {
  try {
    const json = JSON.stringify(value);
    if (json === void 0 || Buffer.byteLength(json, "utf8") > 1048576) return "sha256:unavailable";
    return `sha256:${createHash2("sha256").update(json).digest("hex")}`;
  } catch {
    return "sha256:unavailable";
  }
}
function snapshotInvokeRequest(value) {
  if (typeof value !== "object" || value === null) throw new Error("invalid request");
  const prototype = Object.getPrototypeOf(value);
  const allowed = /* @__PURE__ */ new Set(["nodeId", "provide", "globalId", "input", "traceId", "spanId", "parentSpanId", "callerNodeId", "session", "abortSignal"]);
  if (prototype !== Object.prototype && prototype !== null || Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new Error("invalid request");
  }
  const fields = {};
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid request");
    fields[key] = descriptor.value;
  }
  if (typeof fields.nodeId !== "string" || typeof fields.provide !== "string" || !Object.hasOwn(fields, "input")) throw new Error("invalid request");
  return fields;
}
function validTargetPart(value) {
  return typeof value === "string" && value.length <= 128 && /^[a-z0-9][a-z0-9_-]*$/.test(value);
}
function safeDefinitionNodeId(definition) {
  try {
    return typeof definition?.manifest?.node?.id === "string" ? definition.manifest.node.id : "invalid";
  } catch {
    return "invalid";
  }
}
function safeDefinitionDigest(definition) {
  try {
    return typeof definition?.contractDigest === "string" ? definition.contractDigest : void 0;
  } catch {
    return void 0;
  }
}
function createExecutionEventEmitter(subscribers) {
  if (subscribers.size === 0) return void 0;
  return async (event) => {
    for (const observer of subscribers) {
      try {
        void Promise.resolve(observer(event)).catch(() => void 0);
      } catch {
      }
    }
  };
}
function createUnsubscribe(subscribers, recorder) {
  return () => {
    subscribers.delete(recorder);
  };
}
function buildSearchCatalog(node) {
  return Object.freeze(node.provides.map((provide, provideIndex) => Object.freeze({
    provideIndex,
    provideName: provide.name,
    searchText: [
      node.purpose,
      provide.name,
      provide.description,
      ...provide.tags ?? [],
      ...provide.effects ?? [],
      ...schemaSearchTerms(provide.inputSchema),
      ...schemaSearchTerms(provide.outputSchema)
    ].join(" ").toLowerCase()
  })));
}
function schemaSearchTerms(schema) {
  const terms = [];
  const stack = [{ value: schema, depth: 0 }];
  let remaining = 1024;
  while (stack.length && remaining-- > 0) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || depth > 16) continue;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 128)) stack.push({ value: child, depth: depth + 1 });
      continue;
    }
    for (const [key, child] of Object.entries(value).slice(0, 128)) {
      if (key === "description" && typeof child === "string") terms.push(child.slice(0, 1024));
      else if (key === "properties" && child && typeof child === "object" && !Array.isArray(child)) terms.push(...Object.keys(child).slice(0, 128));
      if (typeof child === "object" && child !== null) stack.push({ value: child, depth: depth + 1 });
    }
  }
  return terms;
}
function cloneProtocolNode(node) {
  return {
    ...node,
    provides: node.provides.map(cloneProvide)
  };
}
function cloneProtocolNodeWithAllowedProvides(node) {
  const cloned = cloneProtocolNode(node);
  const control = getInvocationControl();
  cloned.provides = cloned.provides.filter(
    (provide) => !control || targetAllowed(control.grant, `${cloned.nodeId}.${provide.name}`) && effectsAllowed(control.grant, provide.effects ?? [])
  );
  return cloned;
}
function cloneProvide(provide) {
  return {
    ...provide,
    inputSchema: cloneJsonLike(provide.inputSchema),
    outputSchema: cloneJsonLike(provide.outputSchema),
    execution: { ...provide.execution },
    ...provide.policy ? { policy: cloneJsonLike(provide.policy) } : {}
  };
}
function createProvideSnapshot(node, provideName) {
  const provide = node.provides.find((item) => item.name === provideName);
  if (!provide) throw new Error(`Provide not found in node snapshot: ${node.nodeId}.${provideName}`);
  return createProvideSnapshotFromProvide(node, provide);
}
function createProvideSnapshotFromProvide(node, provide) {
  return {
    ...cloneProvide(provide),
    nodeId: node.nodeId,
    globalId: `${node.nodeId}.${provide.name}`
  };
}
function cloneJsonLike(value) {
  return value === void 0 ? value : JSON.parse(JSON.stringify(value));
}
function freezeSnapshot(value) {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) freezeSnapshot(child);
  }
  return Object.freeze(value);
}
function createId(prefix) {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

// packages/pi-protocol/sdk/session-cache.ts
var managers = /* @__PURE__ */ new Set();
function getProtocolAgentSessionDiagnostics() {
  return Object.freeze({ cacheCount: managers.size, sessionCount: [...managers].reduce((total, manager) => total + manager.size(), 0) });
}

// packages/pi-protocol/cli/doctor.ts
function diagnoseProtocolRuntime(fabric = ensureProtocolFabric()) {
  const host = getProtocolHostDiagnostics();
  const diagnostics = fabric.diagnostics();
  const audit = fabric.auditDiagnostics();
  const sessions = getProtocolAgentSessionDiagnostics();
  const issues = [];
  if (!host) issues.push({ severity: "error", code: "HOST_ABI_MISSING", message: "Compatible protocol host ABI is not installed" });
  if (host && new Set(host.runtimeCopies.map((copy) => copy.packageVersion)).size > 1) issues.push({ severity: "error", code: "RUNTIME_VERSION_SPLIT", message: "Loaded protocol package copies disagree on version" });
  if (diagnostics.registrations.some((registration) => !registration.contractDigest || registration.generation < 1)) issues.push({ severity: "error", code: "REGISTRATION_ALIGNMENT", message: "Registration is missing generation or contract digest" });
  if (diagnostics.registrations.some((registration) => registration.draining && registration.inFlight === 0)) issues.push({ severity: "warning", code: "DRAIN_STALLED", message: "A registration is draining without in-flight calls" });
  if (audit.sinkFailures > 0 || audit.sinkDropped > 0) issues.push({ severity: "warning", code: "AUDIT_DEGRADED", message: `Audit sink failures=${audit.sinkFailures}, dropped=${audit.sinkDropped}` });
  if (audit.observerDropped > 0 || audit.observerFailures > 0) issues.push({ severity: "warning", code: "OBSERVER_DEGRADED", message: `Observer failures=${audit.observerFailures}, dropped=${audit.observerDropped}` });
  return Object.freeze({
    schemaVersion: 1,
    ok: !issues.some((issue2) => issue2.severity === "error"),
    ...host ? { host } : {},
    fabric: diagnostics,
    audit,
    sessions,
    issues: Object.freeze(issues.map((issue2) => Object.freeze({ ...issue2 })))
  });
}
async function runDoctorCli(argv2 = process.argv.slice(2)) {
  const report = diagnoseProtocolRuntime();
  if (argv2.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? "PASS" : "FAIL"} Pi Protocol runtime doctor`);
    console.log(`  host ABI: ${report.host?.abiVersion ?? "missing"}`);
    console.log(`  runtime copies: ${report.host?.runtimeCopies.length ?? 0}`);
    console.log(`  registrations: ${report.fabric.registrations.length}`);
    console.log(`  admission: ${report.fabric.admission.active} active / ${report.fabric.admission.queued} queued`);
    console.log(`  sessions: ${report.sessions.sessionCount}`);
    for (const issue2 of report.issues) console.log(`  ${issue2.severity.toUpperCase()} ${issue2.code}: ${issue2.message}`);
  }
  return report.ok ? 0 : 1;
}

// packages/pi-protocol/cli/generate.ts
import { mkdirSync, readFileSync as readFileSync3, renameSync, rmSync, statSync as statSync3, writeFileSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute3, join as join2, relative as relative3, resolve as resolve4 } from "node:path";
async function runGenerateCli(argv2 = process.argv.slice(2)) {
  const check = argv2.includes("--check");
  const packageDir = resolve4(positional(argv2)[0] ?? process.cwd());
  const packageJson = JSON.parse(readBounded2(join2(packageDir, "package.json"), 1048576));
  const outputArg = option(argv2, "--output") ?? packageJson.piProtocol?.generated ?? "protocol.generated.ts";
  const output = contained(packageDir, outputArg);
  const definition = parseProtocolManifest(readBounded2(join2(packageDir, "pi.protocol.json"), 1048576));
  const generated = generateProtocolTypes(definition);
  if (check) {
    let actual = "";
    try {
      actual = readBounded2(output, 2097152);
    } catch {
    }
    if (actual !== generated) {
      console.error(`Generated artifact drift: ${relative3(packageDir, output)}`);
      return 1;
    }
  } else {
    atomicWrite(output, generated);
    console.log(`Generated ${relative3(packageDir, output)} (${definition.contractDigest})`);
  }
  const catalogArg = option(argv2, "--catalog");
  if (catalogArg) {
    const catalog = contained(packageDir, catalogArg);
    const source = `${JSON.stringify({
      schemaVersion: 1,
      node: definition.manifest.node,
      contractDigest: definition.contractDigest,
      provides: definition.manifest.provides.map((provide) => ({ name: provide.name, description: provide.description, tags: provide.tags ?? [], effects: provide.effects ?? [] }))
    }, null, 2)}
`;
    if (check) {
      let actual = "";
      try {
        actual = readBounded2(catalog, 2097152);
      } catch {
      }
      if (actual !== source) {
        console.error(`Generated catalog drift: ${relative3(packageDir, catalog)}`);
        return 1;
      }
    } else atomicWrite(catalog, source);
  }
  return 0;
}
function positional(argv2) {
  const values = [];
  for (let index = 0; index < argv2.length; index++) {
    if (["--output", "--catalog"].includes(argv2[index])) {
      index += 1;
      continue;
    }
    if (!argv2[index].startsWith("--")) values.push(argv2[index]);
  }
  return values;
}
function option(argv2, name2) {
  const index = argv2.indexOf(name2);
  return index >= 0 ? argv2[index + 1] : void 0;
}
function contained(root, path) {
  if (!path || path.length > 512 || isAbsolute3(path)) throw new Error(`${path || "output"} must be a bounded relative path`);
  const target = resolve4(root, path);
  const rel = relative3(root, target);
  if (rel.startsWith("..") || isAbsolute3(rel)) throw new Error("Generated output escapes package directory");
  return target;
}
function atomicWrite(path, source) {
  mkdirSync(dirname2(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    writeFileSync(temporary, source, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } finally {
    try {
      rmSync(temporary);
    } catch {
    }
  }
}
function readBounded2(path, maxBytes) {
  const stat = statSync3(path);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error("Input exceeds size limit");
  return readFileSync3(path, "utf8");
}

// packages/pi-protocol/cli/index.ts
async function runProtocolCli(argv2 = process.argv.slice(2)) {
  const [command, ...rest] = argv2;
  if (command === "check") return runCheckCli(rest);
  if (command === "generate") return runGenerateCli(rest);
  if (command === "doctor") return runDoctorCli(rest);
  console.error("Usage: pi-protocol <check|generate|doctor> [options]");
  return 1;
}

// packages/pi-protocol/cli/bin.ts
var name = basename2(process.argv[1] ?? "pi-protocol");
var argv = process.argv.slice(2);
process.exitCode = name.endsWith("-check") ? await runCheckCli(argv) : name.endsWith("-generate") ? await runGenerateCli(argv) : name.endsWith("-doctor") ? await runDoctorCli(argv) : await runProtocolCli(argv);
