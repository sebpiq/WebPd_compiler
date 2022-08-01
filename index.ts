import compile from './src/compile'
export default compile
export {default as NODE_IMPLEMENTATIONS} from './src/nodes'
export {Code, CompilerSettings} from './src/types'
export {AssemblyScriptWasmEngine} from './src/engine-assemblyscript/types'
export {JavaScriptEngine} from './src/engine-javascript/types'
export * as assemblyscriptWasmBindings from './src/engine-assemblyscript/bindings'