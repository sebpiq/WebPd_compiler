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

/**
 * These bindings enable easier interaction with Wasm modules generated with our AssemblyScript compilation.
 * For example : instantiation, passing data back and forth, etc ...
 *
 * **Warning** : These bindings are compiled with rollup as a standalone JS module for inclusion in other libraries.
 * In consequence, they are meant to be kept lightweight, and should avoid importing dependencies.
 *
 * @module
 */

import { CodeVariableName, Compilation, EnginePorts } from '../types'
import {
    AssemblyScriptWasmExports,
    InternalPointer,
    StringPointer,
    TypedArrayPointer,
} from './types'

type TypedArrayConstructor =
    | typeof Int8Array
    | typeof Uint8Array
    | typeof Int16Array
    | typeof Uint16Array
    | typeof Int32Array
    | typeof Uint32Array
    | typeof Uint8ClampedArray
    | typeof Float32Array
    | typeof Float64Array

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

// TODO : Rethink what info should be passed to the bindings constructor
// (e.g. variable names, portSpecs are generated automatically by the compilation, i.e. shouldnt be public settings)
export interface EngineSettings {
    portSpecs?: Compilation['portSpecs']
    inletListenersCallbacks?: {
        [nodeId: PdDspGraph.NodeId]: {
            [inletId: PdDspGraph.PortletId]: (
                messages: Array<PdSharedTypes.ControlValue>
            ) => void
        }
    }
    audioSettings: Compilation['audioSettings']
}

/**
 * Class to interact more easily with a Wasm module compiled from assemblyscript code.
 * Use `createEngine` for more convenient instantiation.
 */
export class AssemblyScriptWasmEngine {
    public wasmExports: AssemblyScriptWasmExports
    public ports: EnginePorts
    private settings: EngineSettings
    private wasmBuffer: ArrayBuffer
    private wasmOutputPointer: TypedArrayPointer

    constructor(wasmBuffer: ArrayBuffer, settings: EngineSettings) {
        this.wasmBuffer = wasmBuffer
        this.settings = settings
    }

    async initialize() {
        const wasmModule = await instantiateWasmModule(this.wasmBuffer, {
            input: this._makeMessageListenersWasmImports(),
        })
        this.wasmExports = (wasmModule.instance
            .exports as unknown) as AssemblyScriptWasmExports
        this.ports = this._bindPorts()
    }

    configure(sampleRate: number, blockSize: number): void {
        this.wasmOutputPointer = this.wasmExports.configure(
            sampleRate,
            blockSize
        )
    }

    loop(): Float32Array | Float64Array {
        this.wasmExports.loop()
        return liftTypedArray(
            this.wasmExports,
            this.settings.audioSettings.bitDepth === 32
                ? Float32Array
                : Float64Array,
            this.wasmOutputPointer
        ) as Float32Array | Float64Array
    }

    setArray(
        arrayName: string,
        data: Array<number> | Float32Array | Float64Array
    ) {
        if (!this.wasmExports.setArray) {
            console.warn(`Wasm exports doesn't define "setArray"`)
            return
        }
        const stringPointer = lowerString(this.wasmExports, arrayName)
        const bufferPointer = this.lowerArrayBufferOfFloats(data)
        this.wasmExports.setArray(stringPointer, bufferPointer)
    }

    // TODO : ---- V ----  Private API ?
    liftMessage(messagePointer: InternalPointer): PdSharedTypes.ControlValue {
        const messageDatumTypesPointer = this.wasmExports.getMessageDatumTypes(
            messagePointer
        )
        const messageDatumTypes = liftTypedArray(
            this.wasmExports,
            Int32Array,
            messageDatumTypesPointer
        )
        const message: PdSharedTypes.ControlValue = []
        messageDatumTypes.forEach((datumType, datumIndex) => {
            if (
                datumType ===
                this.wasmExports.MESSAGE_DATUM_TYPE_FLOAT.valueOf()
            ) {
                message.push(
                    this.wasmExports.readFloatDatum(messagePointer, datumIndex)
                )
            } else if (
                datumType ===
                this.wasmExports.MESSAGE_DATUM_TYPE_STRING.valueOf()
            ) {
                const stringPointer = this.wasmExports.readStringDatum(
                    messagePointer,
                    datumIndex
                )
                message.push(liftString(this.wasmExports, stringPointer))
            }
        })
        return message
    }

    lowerMessage(message: PdSharedTypes.ControlValue): InternalPointer {
        const messageTemplate: Array<number> = message.reduce(
            (template, value) => {
                if (typeof value === 'number') {
                    template.push(
                        this.wasmExports.MESSAGE_DATUM_TYPE_FLOAT.valueOf()
                    )
                } else if (typeof value === 'string') {
                    template.push(
                        this.wasmExports.MESSAGE_DATUM_TYPE_STRING.valueOf()
                    )
                    template.push(value.length)
                } else {
                    throw new Error(`invalid message value ${value}`)
                }
                return template
            },
            [] as Array<number>
        )

        const messagePointer = this.wasmExports.createMessage(
            this.lowerArrayBufferOfIntegers(messageTemplate)
        )

        message.forEach((value, index) => {
            if (typeof value === 'number') {
                this.wasmExports.writeFloatDatum(messagePointer, index, value)
            } else if (typeof value === 'string') {
                const stringPointer = lowerString(this.wasmExports, value)
                this.wasmExports.writeStringDatum(
                    messagePointer,
                    index,
                    stringPointer
                )
            }
        })

        return messagePointer
    }

    lowerMessageArray(
        messages: Array<PdSharedTypes.ControlValue>
    ): InternalPointer {
        const messageArrayPointer = this.wasmExports.createMessageArray()
        messages.forEach((message) => {
            this.wasmExports.pushMessageToArray(
                messageArrayPointer,
                this.lowerMessage(message)
            )
        })
        return messageArrayPointer
    }

    lowerArrayBufferOfIntegers(integers: Array<number>) {
        const buffer = new ArrayBuffer(
            INT_ARRAY_BYTES_PER_ELEMENT * integers.length
        )
        const dataView = new DataView(buffer)
        for (let i = 0; i < integers.length; i++) {
            dataView.setInt32(INT_ARRAY_BYTES_PER_ELEMENT * i, integers[i])
        }
        return lowerBuffer(this.wasmExports, buffer)
    }

    lowerArrayBufferOfFloats(
        floats: Array<number> | Float32Array | Float64Array
    ) {
        const bytesPerElement = this.settings.audioSettings.bitDepth / 8
        const buffer = new ArrayBuffer(bytesPerElement * floats.length)
        const dataView = new DataView(buffer)
        const setFloatName =
            this.settings.audioSettings.bitDepth === 32
                ? 'setFloat32'
                : 'setFloat64'
        for (let i = 0; i < floats.length; i++) {
            dataView[setFloatName](bytesPerElement * i, floats[i])
        }
        return lowerBuffer(this.wasmExports, buffer)
    }

    _bindPorts(): EnginePorts {
        const ports: EnginePorts = {}
        const wasmExports = this.wasmExports as any
        Object.entries(this.settings.portSpecs || {}).forEach(
            ([variableName, spec]) => {
                // TODO : Shouldn't regenerate the variable names on the fly like dat
                if (spec.access.includes('w')) {
                    if (spec.type === 'messages') {
                        ports[`write_${variableName}`] = (messages) => {
                            const messageArrayPointer = this.lowerMessageArray(
                                messages
                            )
                            wasmExports[`write_${variableName}`](
                                messageArrayPointer
                            )
                        }
                    } else {
                        ports[`write_${variableName}`] =
                            wasmExports[`write_${variableName}`]
                    }
                }

                if (spec.access.includes('r')) {
                    if (spec.type === 'messages') {
                        ports[`read_${variableName}`] = () => {
                            const messagesCount = wasmExports[
                                `read_${variableName}_length`
                            ]()
                            const messages: Array<PdSharedTypes.ControlValue> = []
                            for (let i = 0; i < messagesCount; i++) {
                                const messagePointer = wasmExports[
                                    `read_${variableName}_elem`
                                ](i)
                                messages.push(this.liftMessage(messagePointer))
                            }
                            return messages
                        }
                    } else {
                        ports[`read_${variableName}`] =
                            wasmExports[`read_${variableName}`]
                    }
                }
            }
        )

        return ports
    }

    _makeMessageListenersWasmImports() {
        const wasmImports: {
            [listenerName: CodeVariableName]: () => void
        } = {}
        Object.entries(this.settings.inletListenersCallbacks || {}).forEach(
            ([nodeId, callbacks]) => {
                Object.entries(callbacks).forEach(([inletId, callback]) => {
                    // TODO : Shouldn't regenerate the variable names on the fly like dat
                    const listenerName = `inletListener_${nodeId}_${inletId}`
                    wasmImports[listenerName] = () => {
                        callback(this.ports[`read_${nodeId}_INS_${inletId}`]())
                    }
                })
            }
        )
        return wasmImports
    }
}

export const createEngine = async (
    wasmBuffer: ArrayBuffer,
    settings: EngineSettings
) => {
    const engine = new AssemblyScriptWasmEngine(wasmBuffer, settings)
    await engine.initialize()
    return engine
}

// REF : Assemblyscript ESM bindings
export const liftTypedArray = (
    wasmExports: AssemblyScriptWasmExports,
    constructor: TypedArrayConstructor,
    pointer: InternalPointer
) => {
    if (!pointer) return null
    const memoryU32 = new Uint32Array(wasmExports.memory.buffer)
    return new constructor(
        wasmExports.memory.buffer,
        memoryU32[(pointer + 4) >>> 2],
        memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
    ).slice()
}

// REF : Assemblyscript ESM bindings
export const liftString = (
    wasmExports: AssemblyScriptWasmExports,
    pointer: number
) => {
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
export const lowerString = (
    wasmExports: AssemblyScriptWasmExports,
    value: string
) => {
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
    wasmExports: AssemblyScriptWasmExports,
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

// REF : Assemblyscript ESM bindings
export const instantiateWasmModule = async (
    wasmBuffer: ArrayBuffer,
    wasmImports: any = {}
) => {
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
        env: {
            abort: (
                messagePointer: StringPointer,
                fileNamePointer: StringPointer,
                lineNumber: number,
                columnNumber: number
            ) => {
                const message = liftString(wasmExports, messagePointer >>> 0)
                const fileName = liftString(wasmExports, fileNamePointer >>> 0)
                lineNumber = lineNumber >>> 0
                columnNumber = columnNumber >>> 0
                ;(() => {
                    // @external.js
                    throw Error(
                        `${message} in ${fileName}:${lineNumber}:${columnNumber}`
                    )
                })()
            },
            seed: () => {
                return (() => {
                    return Date.now() * Math.random()
                })()
            },
            'console.log': (textPointer: StringPointer) => {
                console.log(liftString(wasmExports, textPointer))
            },
        },
        ...wasmImports,
    })
    const wasmExports = (wasmModule.instance
        .exports as unknown) as AssemblyScriptWasmExports
    return wasmModule
}
