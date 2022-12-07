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

import { DspGraph } from '@webpd/dsp-graph'
import {
    CodeVariableName,
    EngineAccessors,
    Engine,
    AudioSettings,
    Message,
} from '../types'
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
        [nodeId: DspGraph.NodeId]: {
            [inletId: DspGraph.PortletId]: (messages: Array<Message>) => void
        }
    }
}

interface AudioConfig {
    sampleRate: number
    blockSize: number
}

/**
 * Class to interact more easily with a Wasm module compiled from assemblyscript code.
 * Use `createEngine` for more convenient instantiation.
 */
export class AssemblyScriptWasmEngine implements Engine {
    public wasmExports: AssemblyScriptWasmExports
    public accessors: EngineAccessors
    public metadata: EngineMetadata
    private settings: BindingsSettings
    private wasmBuffer: ArrayBuffer
    private wasmOutputPointer: TypedArrayPointer
    private audioConfig: AudioConfig

    constructor(wasmBuffer: ArrayBuffer, settings: BindingsSettings) {
        this.wasmBuffer = wasmBuffer
        this.settings = settings
    }

    async initialize() {
        // We need to read metadata before everything, because it is used by other initialization functions
        this.metadata = await readMetadata(this.wasmBuffer)
        const wasmInstance = await instantiateWasmModule(this.wasmBuffer, {
            input: this._makeMessageListenersWasmImports(),
        })
        this.wasmExports = (wasmInstance.exports as unknown) as AssemblyScriptWasmExports
        this.accessors = this._bindAccessors()
    }

    configure(sampleRate: number, blockSize: number): void {
        this.audioConfig = {
            sampleRate, blockSize
        }
        this.wasmOutputPointer = this.wasmExports.configure(
            sampleRate,
            blockSize
        )
    }

    loop(output: Array<Float32Array | Float64Array>) {
        this.wasmExports.loop()
        const wasmOutput = liftTypedArray(
            this.wasmExports,
            this.metadata.compilation.audioSettings.bitDepth === 32
                ? Float32Array
                : Float64Array,
            this.wasmOutputPointer
        ) as Float32Array | Float64Array

        for (let channel = 0; channel < output.length; channel++) {
            output[channel].set(
                wasmOutput.subarray(
                    this.audioConfig.blockSize * channel,
                    this.audioConfig.blockSize * (channel + 1)
                )
            )
        }
    }

    setArray(
        arrayName: string,
        data: Array<number> | Float32Array | Float64Array
    ) {
        const stringPointer = lowerString(this.wasmExports, arrayName)
        const bufferPointer = lowerArrayBufferOfFloats(
            this.wasmExports,
            this.metadata.compilation.audioSettings.bitDepth,
            data
        )
        this.wasmExports.setArray(stringPointer, bufferPointer)
    }

    _bindAccessors(): EngineAccessors {
        const accessors: EngineAccessors = {}
        const wasmExports = this.wasmExports as any
        Object.entries(this.metadata.compilation.accessorSpecs || {}).forEach(
            ([variableName, spec]) => {
                if (spec.access.includes('w')) {
                    const portVariableName = this.metadata.compilation
                        .engineVariableNames.accessors[variableName].w
                    if (spec.type === 'message') {
                        accessors[portVariableName] = (messages) => {
                            const messageArrayPointer = lowerMessageArray(
                                this.wasmExports,
                                messages
                            )
                            wasmExports[portVariableName](messageArrayPointer)
                        }
                    } else {
                        accessors[portVariableName] =
                            wasmExports[portVariableName]
                    }
                }

                if (spec.access.includes('r')) {
                    const portVariableNames = this.metadata.compilation
                        .engineVariableNames.accessors[variableName]
                    if (spec.type === 'message') {
                        accessors[portVariableNames.r] = () => {
                            const messagesCount = wasmExports[
                                portVariableNames.r_length
                            ]()
                            const messages: Array<Message> = []
                            for (let i = 0; i < messagesCount; i++) {
                                const messagePointer = wasmExports[
                                    portVariableNames.r_elem
                                ](i)
                                messages.push(
                                    liftMessage(
                                        this.wasmExports,
                                        messagePointer
                                    )
                                )
                            }
                            return messages
                        }
                    } else {
                        accessors[portVariableNames.r] =
                            wasmExports[portVariableNames.r]
                    }
                }
            }
        )

        return accessors
    }

    _makeMessageListenersWasmImports() {
        const wasmImports: {
            [listenerName: CodeVariableName]: () => void
        } = {}
        Object.entries(this.settings.inletListenersCallbacks || {}).forEach(
            ([nodeId, callbacks]) => {
                Object.entries(callbacks).forEach(([inletId, callback]) => {
                    const listenerName = this.metadata.compilation
                        .engineVariableNames.inletListeners[nodeId][inletId]
                    const inletVariableName = this.metadata.compilation
                        .engineVariableNames.n[nodeId].ins[inletId]
                    const portVariableName = this.metadata.compilation
                        .engineVariableNames.accessors[inletVariableName].r
                    wasmImports[listenerName] = () => {
                        callback(this.accessors[portVariableName]())
                    }
                })
            }
        )
        return wasmImports
    }
}

export const readMetadata = async (
    wasmBuffer: ArrayBuffer
): Promise<EngineMetadata> => {
    // In order to read metadata, we need to introspect the module to get the imports
    const inputImports: {
        [listenerName: CodeVariableName]: () => void
    } = {}
    const wasmModule = WebAssembly.Module.imports(
        new WebAssembly.Module(wasmBuffer)
    )

    // Then we generate dummy functions to be able to instantiate the module
    wasmModule
        .filter(
            (imprt) => imprt.module === 'input' && imprt.kind === 'function'
        )
        .forEach((imprt) => (inputImports[imprt.name] = () => undefined))
    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: inputImports,
    })

    // Finally, once the module instantiated, we read the metadata
    const wasmExports = (wasmInstance.exports as unknown) as AssemblyScriptWasmExports
    const stringPointer = wasmExports.metadata.valueOf()
    const metadataJSON = liftString(wasmExports, stringPointer)
    return JSON.parse(metadataJSON)
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
// TODO: Reuse module instead of rebuilding each time.
export const instantiateWasmModule = async (
    wasmBuffer: ArrayBuffer,
    wasmImports: any = {}
) => {
    const instanceAndModule = await WebAssembly.instantiate(wasmBuffer, {
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
    const wasmExports = (instanceAndModule.instance
        .exports as unknown) as AssemblyScriptWasmExports
    return instanceAndModule.instance
}

export const liftMessage = (
    wasmExports: AssemblyScriptWasmExports,
    messagePointer: InternalPointer
): Message => {
    const messageDatumTypesPointer = wasmExports.getMessageDatumTypes(
        messagePointer
    )
    const messageDatumTypes = liftTypedArray(
        wasmExports,
        Int32Array,
        messageDatumTypesPointer
    )
    const message: Message = []
    messageDatumTypes.forEach((datumType, datumIndex) => {
        if (datumType === wasmExports.MESSAGE_DATUM_TYPE_FLOAT.valueOf()) {
            message.push(wasmExports.readFloatDatum(messagePointer, datumIndex))
        } else if (
            datumType === wasmExports.MESSAGE_DATUM_TYPE_STRING.valueOf()
        ) {
            const stringPointer = wasmExports.readStringDatum(
                messagePointer,
                datumIndex
            )
            message.push(liftString(wasmExports, stringPointer))
        }
    })
    return message
}

export const lowerMessage = (
    wasmExports: AssemblyScriptWasmExports,
    message: Message
): InternalPointer => {
    const messageTemplate: Array<number> = message.reduce((template, value) => {
        if (typeof value === 'number') {
            template.push(wasmExports.MESSAGE_DATUM_TYPE_FLOAT.valueOf())
        } else if (typeof value === 'string') {
            template.push(wasmExports.MESSAGE_DATUM_TYPE_STRING.valueOf())
            template.push(value.length)
        } else {
            throw new Error(`invalid message value ${value}`)
        }
        return template
    }, [] as Array<number>)

    const messagePointer = wasmExports.createMessage(
        lowerArrayBufferOfIntegers(wasmExports, messageTemplate)
    )

    message.forEach((value, index) => {
        if (typeof value === 'number') {
            wasmExports.writeFloatDatum(messagePointer, index, value)
        } else if (typeof value === 'string') {
            const stringPointer = lowerString(wasmExports, value)
            wasmExports.writeStringDatum(messagePointer, index, stringPointer)
        }
    })

    return messagePointer
}

export const lowerMessageArray = (
    wasmExports: AssemblyScriptWasmExports,
    messages: Array<Message>
): InternalPointer => {
    const messageArrayPointer = wasmExports.createMessageArray()
    messages.forEach((message) => {
        wasmExports.pushMessageToArray(
            messageArrayPointer,
            lowerMessage(wasmExports, message)
        )
    })
    return messageArrayPointer
}

export const lowerArrayBufferOfIntegers = (
    wasmExports: AssemblyScriptWasmExports,
    integers: Array<number>
) => {
    const buffer = new ArrayBuffer(
        INT_ARRAY_BYTES_PER_ELEMENT * integers.length
    )
    const dataView = new DataView(buffer)
    for (let i = 0; i < integers.length; i++) {
        dataView.setInt32(INT_ARRAY_BYTES_PER_ELEMENT * i, integers[i])
    }
    return lowerBuffer(wasmExports, buffer)
}

export const lowerArrayBufferOfFloats = (
    wasmExports: AssemblyScriptWasmExports,
    bitDepth: AudioSettings['bitDepth'],
    floats: Array<number> | Float32Array | Float64Array
) => {
    const bytesPerElement = bitDepth / 8
    const buffer = new ArrayBuffer(bytesPerElement * floats.length)
    const dataView = new DataView(buffer)
    const setFloatName = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
    for (let i = 0; i < floats.length; i++) {
        dataView[setFloatName](bytesPerElement * i, floats[i])
    }
    return lowerBuffer(wasmExports, buffer)
}

// ------------------------ Primitives

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
