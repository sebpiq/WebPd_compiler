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

import { CodeVariableName, EnginePorts, Engine } from '../types'
import {
    AssemblyScriptWasmExports,
    EngineMetadata,
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

export interface BindingsSettings {
    inletListenersCallbacks?: {
        [nodeId: PdDspGraph.NodeId]: {
            [inletId: PdDspGraph.PortletId]: (
                messages: Array<PdSharedTypes.ControlValue>
            ) => void
        }
    }
}

/**
 * Class to interact more easily with a Wasm module compiled from assemblyscript code.
 * Use `createEngine` for more convenient instantiation.
 */
export class AssemblyScriptWasmEngine implements Engine {
    public wasmExports: AssemblyScriptWasmExports
    public ports: EnginePorts
    public metadata: EngineMetadata
    private settings: BindingsSettings
    private wasmBuffer: ArrayBuffer
    private wasmOutputPointer: TypedArrayPointer

    constructor(wasmBuffer: ArrayBuffer, settings: BindingsSettings) {
        this.wasmBuffer = wasmBuffer
        this.settings = settings
    }

    async initialize() {
        const wasmModule = await instantiateWasmModule(this.wasmBuffer, {
            input: this._makeMessageListenersWasmImports(),
        })
        this.wasmExports = (wasmModule.instance
            .exports as unknown) as AssemblyScriptWasmExports
        this.metadata = this._getMetadata()
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
            this.metadata.compilation.audioSettings.bitDepth === 32
                ? Float32Array
                : Float64Array,
            this.wasmOutputPointer
        ) as Float32Array | Float64Array
    }

    setArray(
        arrayName: string,
        data: Array<number> | Float32Array | Float64Array
    ) {
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
        const bytesPerElement = this.metadata.compilation.audioSettings.bitDepth / 8
        const buffer = new ArrayBuffer(bytesPerElement * floats.length)
        const dataView = new DataView(buffer)
        const setFloatName =
            this.metadata.compilation.audioSettings.bitDepth === 32
                ? 'setFloat32'
                : 'setFloat64'
        for (let i = 0; i < floats.length; i++) {
            dataView[setFloatName](bytesPerElement * i, floats[i])
        }
        return lowerBuffer(this.wasmExports, buffer)
    }

    _getMetadata(): EngineMetadata {
        const stringPointer = this.wasmExports.metadata.valueOf()
        const metadataJSON = liftString(this.wasmExports, stringPointer)
        return JSON.parse(metadataJSON)
    }

    _bindPorts(): EnginePorts {
        const ports: EnginePorts = {}
        const wasmExports = this.wasmExports as any
        Object.entries(this.metadata.compilation.portSpecs || {}).forEach(
            ([variableName, spec]) => {
                if (spec.access.includes('w')) {
                    const portVariableName = this.metadata.compilation.engineVariableNames.ports[variableName].w
                    if (spec.type === 'messages') {
                        ports[portVariableName] = (messages) => {
                            const messageArrayPointer = this.lowerMessageArray(messages)
                            wasmExports[portVariableName](messageArrayPointer)
                        }
                    } else {
                        ports[portVariableName] =
                            wasmExports[portVariableName]
                    }
                }

                if (spec.access.includes('r')) {
                    const portVariableNames = this.metadata.compilation.engineVariableNames.ports[variableName]
                    if (spec.type === 'messages') {
                        ports[portVariableNames.r] = () => {
                            const messagesCount = wasmExports[portVariableNames.r_length]()
                            const messages: Array<PdSharedTypes.ControlValue> = []
                            for (let i = 0; i < messagesCount; i++) {
                                const messagePointer = wasmExports[portVariableNames.r_elem](i)
                                messages.push(this.liftMessage(messagePointer))
                            }
                            return messages
                        }
                    } else {
                        ports[portVariableNames.r] =
                            wasmExports[portVariableNames.r]
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
    settings: BindingsSettings
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
