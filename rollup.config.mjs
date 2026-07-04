import typescript from '@rollup/plugin-typescript';

// GAS has NO module system. The deployed file must expose entry points
// (doPost / doGet) as TOP-LEVEL globals, callable by the GAS runtime as the
// bare identifier `doPost` (not `App.doPost`).
//
// Strategy (research §1.3 GAS-globals gotcha):
//   - Build an IIFE with a namespace object `App` holding the named exports.
//   - In an `outro`, copy each entry point off `App` onto the GAS global
//     object. `_gasGlobal` resolves to `this` at IIFE scope, which under GAS
//     is the global scope (globalThis fallback for other runtimes).
//
// Only entry points that are actually exported are hoisted, so no
// ReferenceError on absent handlers.
const GAS_ENTRY_POINTS = ['doPost', 'doGet', 'setupProject'];

const hoist = GAS_ENTRY_POINTS.map(
  (fn) => `if (App.${fn}) _gasGlobal.${fn} = App.${fn};`
).join(' ');

const outro = `var _gasGlobal = (function(){ return this || (typeof globalThis !== 'undefined' ? globalThis : {}); })(); ${hoist}`;

export default {
  input: 'src/main.ts',
  // `this` at the top of the IIFE === the GAS global object.
  context: 'this',
  output: {
    dir: 'dist',
    entryFileNames: 'main.js',
    format: 'iife',
    name: 'App',
    extend: true,
    outro,
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        declaration: false,
      },
    }),
  ],
};
