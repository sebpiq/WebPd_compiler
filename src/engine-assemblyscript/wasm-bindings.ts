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
    Message,
} from '../types'
import { liftString, lowerString, readTypedArray } from './assemblyscript-core/core-bindings'
import { FsListenersCallbacks, makeFileListenersWasmImports } from './assemblyscript-core/fs-bindings'
import { liftMessage, lowerMessageArray } from './assemblyscript-core/msg-bindings'
import { lowerTypedArray } from './assemblyscript-core/tarray-bindings'
import {
    AssemblyScriptWasmExports,
    EngineMetadata,
    StringPointer,
    TypedArrayPointer,
} from './types'

export interface EngineSettings {
    inletListenersCallbacks?: {
        [nodeId: DspGraph.NodeId]: {
            [inletId: DspGraph.PortletId]: (messages: Array<Message>) => void
        }
    }
    fsListenersCallbacks?: FsListenersCallbacks
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
    private settings: EngineSettings
    private wasmBuffer: ArrayBuffer
    private wasmOutputPointer: TypedArrayPointer
    private wasmInputPointer: TypedArrayPointer
    private audioConfig: AudioConfig
    private arrayType: typeof Float32Array | typeof Float64Array

    constructor(wasmBuffer: ArrayBuffer, settings: EngineSettings) {
        this.wasmBuffer = wasmBuffer
        this.settings = settings
    }

    async initialize() {
        // We need to read metadata before everything, because it is used by other initialization functions
        this.metadata = await readMetadata(this.wasmBuffer)
        this.arrayType =
            this.metadata.compilation.audioSettings.bitDepth === 32
                ? Float32Array
                : Float64Array
        const wasmInstance = await instantiateWasmModule(this.wasmBuffer, {
            input: {
                ...makeFileListenersWasmImports(this.settings.fsListenersCallbacks),
                ...this._makeInletListenersWasmImports(),
            },
        })
        this.wasmExports =
            wasmInstance.exports as unknown as AssemblyScriptWasmExports
        this.accessors = this._bindAccessors()
    }

    configure(sampleRate: number, blockSize: number): void {
        this.audioConfig = {
            sampleRate,
            blockSize,
        }
        this.wasmExports.configure(sampleRate, blockSize)
        this.wasmOutputPointer = this.wasmExports.getOutput()
        this.wasmInputPointer = this.wasmExports.getInput()
    }

    loop(
        input: Array<Float32Array | Float64Array>,
        output: Array<Float32Array | Float64Array>
    ) {
        const wasmInput = readTypedArray(
            this.wasmExports,
            this.arrayType,
            this.wasmInputPointer
        )
        for (let channel = 0; channel < input.length; channel++) {
            wasmInput.set(input[channel], channel * this.audioConfig.blockSize)
        }

        this.wasmExports.loop()

        const wasmOutput = readTypedArray(
            this.wasmExports,
            this.arrayType,
            this.wasmOutputPointer
        )

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
        const tarrayPointer = lowerTypedArray(
            this.wasmExports,
            this.metadata.compilation.audioSettings.bitDepth,
            data
        )
        this.wasmExports.setArray(stringPointer, tarrayPointer)
    }

    _bindAccessors(): EngineAccessors {
        const accessors: EngineAccessors = {}
        const wasmExports = this.wasmExports as any
        const { accessorSpecs, engineVariableNames } = this.metadata.compilation
        Object.entries(accessorSpecs || {}).forEach(([variableName, spec]) => {
            if (spec.access.includes('w')) {
                const portVariableName =
                    engineVariableNames.accessors[variableName].w
                if (spec.type === 'message') {
                    accessors[portVariableName] = (messages) => {
                        const messageArrayPointer = lowerMessageArray(
                            this.wasmExports,
                            messages
                        )
                        wasmExports[portVariableName](messageArrayPointer)
                    }
                } else {
                    accessors[portVariableName] = wasmExports[portVariableName]
                }
            }

            if (spec.access.includes('r')) {
                const portVariableNames =
                    engineVariableNames.accessors[variableName]
                if (spec.type === 'message') {
                    accessors[portVariableNames.r] = () => {
                        const messagesCount =
                            wasmExports[portVariableNames.r_length]()
                        const messages: Array<Message> = []
                        for (let i = 0; i < messagesCount; i++) {
                            const messagePointer =
                                wasmExports[portVariableNames.r_elem](i)
                            messages.push(
                                liftMessage(this.wasmExports, messagePointer)
                            )
                        }
                        return messages
                    }
                } else {
                    accessors[portVariableNames.r] =
                        wasmExports[portVariableNames.r]
                }
            }
        })

        return accessors
    }

    _makeInletListenersWasmImports() {
        const wasmImports: {
            [listenerName: CodeVariableName]: () => void
        } = {}
        const { engineVariableNames } = this.metadata.compilation
        Object.entries(this.settings.inletListenersCallbacks || {}).forEach(
            ([nodeId, callbacks]) => {
                Object.entries(callbacks).forEach(([inletId, callback]) => {
                    const listenerName =
                        engineVariableNames.inletListeners[nodeId][inletId]
                    const inletVariableName =
                        engineVariableNames.n[nodeId].ins[inletId]
                    const portVariableName =
                        engineVariableNames.accessors[inletVariableName].r
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
    const wasmExports =
        wasmInstance.exports as unknown as AssemblyScriptWasmExports
    const stringPointer = wasmExports.metadata.valueOf()
    const metadataJSON = liftString(wasmExports, stringPointer)
    return JSON.parse(metadataJSON)
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
    const wasmExports = instanceAndModule.instance
        .exports as unknown as AssemblyScriptWasmExports
    return instanceAndModule.instance
}