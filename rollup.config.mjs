import typescript from '@rollup/plugin-typescript';

// GAS has NO module system. We bundle into an IIFE namespace object `App`
// (holding the named exports), then emit TOP-LEVEL wrapper `function`
// declarations in the `footer`.
//
// Why real top-level declarations (not a runtime `globalThis.doPost = …`
// assignment): a runtime-assigned global IS callable by the GAS runtime, but
// the Apps Script EDITOR's function picker only lists statically-declared
// top-level functions — so a runtime-assigned entry point shows as
// "No functions" and cannot be Run from the editor (needed for setupProject /
// registerRichMenu). A literal `function doPost(e) {…}` is both runtime-callable
// AND editor-visible.
const GLOBALS = ['doPost', 'setupProject', 'registerRichMenu'];

const footer = GLOBALS.map(
  (fn) => `function ${fn}(e){ return App.${fn} && App.${fn}(e); }`
).join('\n');

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    entryFileNames: 'main.js',
    format: 'iife',
    name: 'App', // extend:false (default) → emits a top-level `var App = …`
    footer,
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
