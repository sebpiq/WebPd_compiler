import { ArrayBufferOfIntegersPointer, InternalPointer } from "./macros/assemblyscript-types"
import { AssemblyScriptWasmEngine } from "./types"

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

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

export const liftMessage = (engine: AssemblyScriptWasmEngine, messagePointer: InternalPointer): PdSharedTypes.ControlValue => {
    const messageDatumTypesPointer = engine.getMessageDatumTypes(messagePointer)
    const messageDatumTypes = liftArrayBufferOfIntegers(engine, messageDatumTypesPointer)
    const message: PdSharedTypes.ControlValue = []
    messageDatumTypes.forEach((datumType, datumIndex) => {
        if (datumType === engine.MESSAGE_DATUM_TYPE_FLOAT.valueOf()) {
            message.push(engine.readFloatDatum(messagePointer, datumIndex))
        } else if (datumType === engine.MESSAGE_DATUM_TYPE_STRING.valueOf()) {
            const stringPointer = engine.readStringDatum(messagePointer, datumIndex)
            message.push(liftString(engine, stringPointer))
        }
    })
    return message
}

export const lowerArrayBufferOfIntegers = (engine: AssemblyScriptWasmEngine, integers: Array<number>) => {
    const buffer = new ArrayBuffer(INT_ARRAY_BYTES_PER_ELEMENT * integers.length) 
    const dataView = new DataView(buffer)
    for (let i = 0; i < integers.length; i++) {
        dataView.setInt32(
            INT_ARRAY_BYTES_PER_ELEMENT * i, integers[i])    
    }
    return lowerBuffer(engine, buffer)
}

export const liftArrayBufferOfIntegers = (
    engine: AssemblyScriptWasmEngine, 
    bufferPointer: ArrayBufferOfIntegersPointer,
): Array<number> => {
    const buffer = liftBuffer(engine, bufferPointer)
    const dataView = new DataView(buffer)
    const elemCount = dataView.byteLength / INT_ARRAY_BYTES_PER_ELEMENT
    const array: Array<number> = new Array(elemCount)
    for (let i = 0; i < elemCount; i++) {
        array[i] = dataView.getInt32(INT_ARRAY_BYTES_PER_ELEMENT * i)
    }
    return array
}

// REF : Assemblyscript ESM bindings
const liftString = (engine: any, pointer: number) => {
    if (!pointer) return null
    pointer = pointer >>> 0
    const end =
        (pointer + new Uint32Array(engine.memory.buffer)[(pointer - 4) >>> 2]) >>> 1
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
const lowerString = (engine: any, value: string) => {
    if (value == null) return 0;
    const
      length = value.length,
      pointer = engine.__new(length << 1, 1) >>> 0,
      memoryU16 = new Uint16Array(engine.memory.buffer);
    for (let i = 0; i < length; ++i) memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i);
    return pointer;
}

// REF : Assemblyscript ESM bindings
const lowerBuffer = (engine: any, value: ArrayBuffer) => {
    if (value == null) return 0
    const pointer = engine.__new(value.byteLength, 0) >>> 0
    new Uint8Array(engine.memory.buffer).set(new Uint8Array(value), pointer)
    return pointer
}

// REF : Assemblyscript ESM bindings
const liftBuffer = (engine: any, pointer: number): ArrayBuffer => {
    pointer = pointer >>> 0
    if (!pointer) return null
    return engine.memory.buffer.slice(pointer, pointer + new Uint32Array(engine.memory.buffer)[pointer - 4 >>> 2])
}
