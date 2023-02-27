import { getFloatArrayType } from '../compile-helpers'
import { renderCode } from '../functional-helpers'
import { Compilation } from '../types'

/**
 * Embed arrays passed to the compiler in the compiled module.
 */
export default (compilation: Compilation) => renderCode`
    ${Object.entries(compilation.arrays).map(
        ([arrayName, array]) => `
        commons_setArray("${arrayName}", new ${
            getFloatArrayType(compilation.audioSettings.bitDepth).name
        }(${array.length}))
        commons_getArray("${arrayName}").set(${JSON.stringify(
            Array.from(array)
        )})
    `
    )}
`
