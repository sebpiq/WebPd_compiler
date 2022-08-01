/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { EnginePorts } from '../types'

export interface JavaScriptEngine {
    configure: (sampleRate: number, blockSize: number) => void
    loop: () => Float32Array
    setArray: (
        arrayName: string,
        data: Float32Array | Float64Array | Array<number>
    ) => void
    ports: EnginePorts
}
