import compile from './src/compile'
export default compile
export {default as NODE_IMPLEMENTATIONS} from './src/nodes'
export {Code, CompilerSettings} from './src/types'
export {JavaScriptEngine} from './src/engine-javascript/types'
export * as AscWasmBindings from './src/engine-assemblyscript/assemblyscript-wasm-bindings'