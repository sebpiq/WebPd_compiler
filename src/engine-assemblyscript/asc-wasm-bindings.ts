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

import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { CompilerSettingsWithDefaults, EnginePorts, PortSpecs } from '../types'
import { AssemblyScriptWasmEngine, InternalPointer } from './types'

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

// Assemblyscript representation of message datum types
export const MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT = {
    [MESSAGE_DATUM_TYPE_FLOAT]: 0,
    [MESSAGE_DATUM_TYPE_STRING]: 1,
}

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

export const setArray = (
    engine: AssemblyScriptWasmEngine,
    arrayName: string,
    data: Array<number> | Float32Array | Float64Array
) => {
    const stringPointer = lowerString(engine, arrayName)
    const bufferPointer = lowerArrayBufferOfFloats(engine, data, engine.getBitDepth())
    engine.setArray(stringPointer, bufferPointer)
}

export const bindPorts = (
    engine: AssemblyScriptWasmEngine,
    portSpecs: PortSpecs
): EnginePorts => {
    const ports: EnginePorts = {}
    Object.entries(portSpecs).forEach(([variableName, spec]) => {
        if (spec.access.includes('w')) {
            if (spec.type === 'messages') {
                ports[`write_${variableName}`] = (messages) => {
                    const messageArrayPointer = lowerMessageArray(
                        engine,
                        messages
                    )
                    ;(engine as any)[`write_${variableName}`](
                        messageArrayPointer
                    )
                }
            } else {
                ports[`write_${variableName}`] = (engine as any)[
                    `write_${variableName}`
                ]
            }
        }

        if (spec.access.includes('r')) {
            if (spec.type === 'messages') {
                ports[`read_${variableName}`] = () => {
                    const messagesCount = (engine as any)[
                        `read_${variableName}_length`
                    ]()
                    const messages: Array<PdSharedTypes.ControlValue> = []
                    for (let i = 0; i < messagesCount; i++) {
                        const messagePointer = (engine as any)[
                            `read_${variableName}_elem`
                        ](i)
                        messages.push(liftMessage(engine, messagePointer))
                    }
                    return messages
                }
            } else {
                ports[`read_${variableName}`] = (engine as any)[
                    `read_${variableName}`
                ]
            }
        }
    })

    return ports
}

export const lowerMessage = (
    engine: AssemblyScriptWasmEngine,
    message: PdSharedTypes.ControlValue
): InternalPointer => {
    const messageTemplate: Array<number> = message.reduce((template, value) => {
        if (typeof value === 'number') {
            template.push(engine.MESSAGE_DATUM_TYPE_FLOAT.valueOf())
        } else if (typeof value === 'string') {
            template.push(engine.MESSAGE_DATUM_TYPE_STRING.valueOf())
            template.push(value.length)
        } else {
            throw new Error(`invalid message value ${value}`)
        }
        return template
    }, [] as Array<number>)

    const messagePointer = engine.createMessage(
        lowerArrayBufferOfIntegers(engine, messageTemplate)
    )

    message.forEach((value, index) => {
        if (typeof value === 'number') {
            engine.writeFloatDatum(messagePointer, index, value)
        } else if (typeof value === 'string') {
            const stringPointer = lowerString(engine, value)
            engine.writeStringDatum(messagePointer, index, stringPointer)
        }
    })

    return messagePointer
}

export const liftMessage = (
    engine: AssemblyScriptWasmEngine,
    messagePointer: InternalPointer
): PdSharedTypes.ControlValue => {
    const messageDatumTypesPointer = engine.getMessageDatumTypes(messagePointer)
    const messageDatumTypes = liftTypedArray(
        engine,
        Int32Array,
        messageDatumTypesPointer
    )
    const message: PdSharedTypes.ControlValue = []
    messageDatumTypes.forEach((datumType, datumIndex) => {
        if (datumType === engine.MESSAGE_DATUM_TYPE_FLOAT.valueOf()) {
            message.push(engine.readFloatDatum(messagePointer, datumIndex))
        } else if (datumType === engine.MESSAGE_DATUM_TYPE_STRING.valueOf()) {
            const stringPointer = engine.readStringDatum(
                messagePointer,
                datumIndex
            )
            message.push(liftString(engine, stringPointer))
        }
    })
    return message
}

export const lowerMessageArray = (
    engine: AssemblyScriptWasmEngine,
    messages: Array<PdSharedTypes.ControlValue>
): InternalPointer => {
    const messageArrayPointer = engine.createMessageArray()
    messages.forEach((message) => {
        engine.pushMessageToArray(
            messageArrayPointer,
            lowerMessage(engine, message)
        )
    })
    return messageArrayPointer
}

export const lowerArrayBufferOfIntegers = (
    engine: AssemblyScriptWasmEngine,
    integers: Array<number>
) => {
    const buffer = new ArrayBuffer(
        INT_ARRAY_BYTES_PER_ELEMENT * integers.length
    )
    const dataView = new DataView(buffer)
    for (let i = 0; i < integers.length; i++) {
        dataView.setInt32(INT_ARRAY_BYTES_PER_ELEMENT * i, integers[i])
    }
    return lowerBuffer(engine, buffer)
}

export const lowerArrayBufferOfFloats = (
    engine: AssemblyScriptWasmEngine,
    floats: Array<number> | Float32Array | Float64Array,
    bitDepth: CompilerSettingsWithDefaults['bitDepth']
) => {
    const bytesPerElement = bitDepth / 8
    const buffer = new ArrayBuffer(bytesPerElement * floats.length)
    const dataView = new DataView(buffer)
    const setFloatName = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
    for (let i = 0; i < floats.length; i++) {
        dataView[setFloatName](bytesPerElement * i, floats[i])
    }
    return lowerBuffer(engine, buffer)
}

// REF : Assemblyscript ESM bindings
export const liftTypedArray = (
    engine: AssemblyScriptWasmEngine,
    constructor: TypedArrayConstructor,
    pointer: InternalPointer
) => {
    if (!pointer) return null
    const memoryU32 = new Uint32Array(engine.memory.buffer)
    return new constructor(
        engine.memory.buffer,
        memoryU32[(pointer + 4) >>> 2],
        memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
    ).slice()
}

// REF : Assemblyscript ESM bindings
export const liftString = (
    engine: AssemblyScriptWasmEngine,
    pointer: number
) => {
    if (!pointer) return null
    pointer = pointer >>> 0
    const end =
        (pointer +
            new Uint32Array(engine.memory.buffer)[(pointer - 4) >>> 2]) >>>
        1
    const memoryU16 = new Uint16Array(engine.memory.buffer)
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
    engine: AssemblyScriptWasmEngine,
    value: string
) => {
    if (value == null) return 0
    const length = value.length,
        pointer = engine.__new(length << 1, 1) >>> 0,
        memoryU16 = new Uint16Array(engine.memory.buffer)
    for (let i = 0; i < length; ++i)
        memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i)
    return pointer
}

// REF : Assemblyscript ESM bindings
const lowerBuffer = (engine: AssemblyScriptWasmEngine, value: ArrayBuffer) => {
    if (value == null) return 0
    const pointer = engine.__new(value.byteLength, 0) >>> 0
    new Uint8Array(engine.memory.buffer).set(new Uint8Array(value), pointer)
    return pointer
}
