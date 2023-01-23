import { default as compile } from './src/compile'
export default compile
export { Code, CompilerSettings } from './src/types'
export { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from './src/constants'
export { Engine } from './src/types'
export { createEngine } from './src/engine-assemblyscript/AssemblyScriptWasmEngine'
export * as utils from './src/compile-helpers'