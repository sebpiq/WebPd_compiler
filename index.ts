import compile from './src/compile'
export default compile
export { Code, CompilerSettings } from './src/types'
export { JavaScriptEngine } from './src/engine-javascript/types'
export { default as NODE_IMPLEMENTATIONS } from './src/nodes'
export * as AssemblyscriptWasmBindings from './src/engine-assemblyscript/assemblyscript-wasm-bindings'
