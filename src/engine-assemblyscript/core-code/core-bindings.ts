import { InternalPointer, FloatArrayPointer } from '../types'

export type TypedArrayConstructor =
    | typeof Int8Array
    | typeof Uint8Array
    | typeof Int16Array
    | typeof Uint16Array
    | typeof Int32Array
    | typeof Uint32Array
    | typeof Uint8ClampedArray
    | typeof Float32Array
    | typeof Float64Array

export interface core_WasmExports {
    createFloatArray: (length: number) => FloatArrayPointer
    // Signatures of internal methods that enable to access wasm memory.
    // REF : https://www.assemblyscript.org/runtime.html#interface
    __new: (length: number, classType: number) => InternalPointer
    memory: WebAssembly.Memory
}

// REF : Assemblyscript ESM bindings
export const liftString = (wasmExports: core_WasmExports, pointer: number) => {
    if (!pointer) return null
    pointer = pointer >>> 0
    const end =
        (pointer +
            new Uint32Array(wasmExports.memory.buffer)[(pointer - 4) >>> 2]) >>>
        1
    const memoryU16 = new Uint16Array(wasmExports.memory.buffer)
    let start = pointer >>> 1
    let string = ''
    while (end - start > 1024) {
        string += String.fromCharCode(
            ...memoryU16.subarray(start, (start += 1024))
        )
    }
    return string + String.fromCharCode(...memoryU16.subarray(start, end))
}

// REF : Assemblyscript ESM bindings
export const lowerString = (wasmExports: core_WasmExports, value: string) => {
    if (value == null) return 0
    const length = value.length,
        pointer = wasmExports.__new(length << 1, 1) >>> 0,
        memoryU16 = new Uint16Array(wasmExports.memory.buffer)
    for (let i = 0; i < length; ++i)
        memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i)
    return pointer
}

// REF : Assemblyscript ESM bindings
export const lowerBuffer = (
    wasmExports: core_WasmExports,
    value: ArrayBuffer
) => {
    if (value == null) return 0
    const pointer = wasmExports.__new(value.byteLength, 0) >>> 0
    new Uint8Array(wasmExports.memory.buffer).set(
        new Uint8Array(value),
        pointer
    )
    return pointer
}

// REF : Assemblyscript ESM bindings `liftTypedArray`
// TODO : move to other file ?
export const readTypedArray = <
    _TypedArrayConstructor extends TypedArrayConstructor
>(
    wasmExports: core_WasmExports,
    constructor: _TypedArrayConstructor,
    pointer: FloatArrayPointer
) => {
    if (!pointer) return null
    const memoryU32 = new Uint32Array(wasmExports.memory.buffer)
    return new constructor(
        wasmExports.memory.buffer,
        memoryU32[(pointer + 4) >>> 2],
        memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
    ) as InstanceType<_TypedArrayConstructor>
}
