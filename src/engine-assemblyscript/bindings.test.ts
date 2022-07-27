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

import assert from "assert"
import {jest} from '@jest/globals'
import { ARRAYS_VARIABLE_NAME, Compilation } from "../compilation"
import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from "../constants"
import { compileAssemblyScript, getAssemblyscriptCoreCode } from "./test-helpers"
import { bindPorts, INT_ARRAY_BYTES_PER_ELEMENT, liftMessage, lowerArrayBufferOfIntegers, lowerMessage, lowerString, MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT, setArray } from "./bindings"
import { AssemblyScriptWasmEngine } from "./types"
import { Code, CompilerSettings, PortSpecs } from "../types"
import { compilePorts } from "./compile"
import { round } from "../test-helpers"
import compile from "../compile"

describe('bindings', () => {
    jest.setTimeout(10000)

    const ASSEMBLY_SCRIPT_CORE_CODE = getAssemblyscriptCoreCode()

    const COMPILER_OPTIONS = {
        target: 'assemblyscript' as CompilerSettings["target"],
        sampleRate: 44100,
        channelCount: 2,
    }

    const float32ToInt32 = (value: number) => {
        const dataView = new DataView(new ArrayBuffer(4))
        dataView.setFloat32(0, value)
        return dataView.getInt32(0)
    }

    describe('bindPorts', () => {

        const getBoundPorts = async (portSpecs: PortSpecs, extraCode: Code) => {
            const compilation = new Compilation({}, {}, {...COMPILER_OPTIONS, portSpecs: portSpecs})
            const code = ASSEMBLY_SCRIPT_CORE_CODE + extraCode + `
                ${compilePorts(compilation, {FloatType: 'f32', FloatArrayType: 'Float32Array'})}
            `
            const module = await compileAssemblyScript(code)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)
            return bindPorts(engine, portSpecs)
        }

        it('should generate port to read message arrays', async () => {
            const portSpecs: PortSpecs = {
                'someMessageArray': {
                    type: 'messages',
                    access: 'r'
                }
            }
            const ports = await getBoundPorts(portSpecs, `
                const someMessageArray: Message[] = []
                const m1 = Message.fromTemplate([
                    ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                ])
                const m2 = Message.fromTemplate([
                    ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 3,
                    ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                ])
                writeFloatDatum(m1, 0, 666.5)
                writeStringDatum(m2, 0, 'bla')
                writeFloatDatum(m2, 1, 123)
                someMessageArray.push(m1)
                someMessageArray.push(m2)
            `)
            assert.deepStrictEqual(Object.keys(ports).sort(), ['read_someMessageArray'])
            assert.deepStrictEqual(ports.read_someMessageArray(), [
                [666.5], ['bla', 123]
            ])
        })

        it('should generate port to write message arrays', async () => {
            const portSpecs: PortSpecs = {
                'someMessageArray': {
                    type: 'messages',
                    access: 'rw'
                }
            }
            const ports = await getBoundPorts(portSpecs, `
                let someMessageArray: Message[] = []
            `)
            assert.deepStrictEqual(Object.keys(ports).sort(), ['read_someMessageArray', 'write_someMessageArray'])
            ports.write_someMessageArray([
                [777, 'hello'], [111]
            ])
            assert.deepStrictEqual(ports.read_someMessageArray(), [
                [777, 'hello'], [111]
            ])
        })

        it('should generate port to read floats', async () => {
            const portSpecs: PortSpecs = {
                'someFloat': {
                    type: 'float',
                    access: 'r'
                }
            }
            const ports = await getBoundPorts(portSpecs, `
                const someFloat: f32 = 999
            `)
            assert.deepStrictEqual(Object.keys(ports).sort(), ['read_someFloat'])
            assert.strictEqual(ports.read_someFloat(), 999)
        })

        it('should generate port to write floats', async () => {
            const portSpecs: PortSpecs = {
                'someFloat': {
                    type: 'float',
                    access: 'rw'
                }
            }
            const ports = await getBoundPorts(portSpecs, `
                let someFloat: f32 = 456
            `)
            assert.deepStrictEqual(Object.keys(ports).sort(), ['read_someFloat', 'write_someFloat'])
            ports.write_someFloat(666)
            assert.strictEqual(ports.read_someFloat(), 666)
        })

    })

    describe('setArray', () => {

        it('should set the array', async () => {
            const code = compile({}, {}, COMPILER_OPTIONS) + `
                export function testReadArray (arrayName: string, index: i32): f32 {
                    return ${ARRAYS_VARIABLE_NAME}[arrayName][index]
                }
            `
            const module = await compileAssemblyScript(code)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)

            setArray(engine, 'array1', new Float32Array([11.1, 22.2, 33.3]))
            setArray(engine, 'array2', new Float64Array([44.4, 55.5]))
            setArray(engine, 'array3', [66.6, 77.7])
            
            let actual: number
            actual = (engine as any).testReadArray(lowerString(engine, 'array1'), 1)
            assert.strictEqual(round(actual), 22.2)
            actual = (engine as any).testReadArray(lowerString(engine, 'array2'), 0)
            assert.strictEqual(round(actual), 44.4)
            actual = (engine as any).testReadArray(lowerString(engine, 'array3'), 1)
            assert.strictEqual(round(actual), 77.7)
        })

    })

    describe('lowerArrayBufferOfIntegers', () => {

        it('should correctly lower the given array to an ArrayBuffer of integers', async () => {
            const module = await compileAssemblyScript(`
                export function testReadArrayBufferOfIntegers(buffer: ArrayBuffer, index: i32): i32 {
                    const dataView = new DataView(buffer)
                    return dataView.getInt32(index * sizeof<i32>())
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)

            const bufferPointer = lowerArrayBufferOfIntegers(engine, [1, 22, 333, 4444])

            assert.strictEqual((engine as any).testReadArrayBufferOfIntegers(bufferPointer, 0), 1)
            assert.strictEqual((engine as any).testReadArrayBufferOfIntegers(bufferPointer, 1), 22)
            assert.strictEqual((engine as any).testReadArrayBufferOfIntegers(bufferPointer, 2), 333)
            assert.strictEqual((engine as any).testReadArrayBufferOfIntegers(bufferPointer, 3), 4444)
        })

    })

    describe('lowerMessage', () => {

        it('should create the message with correct header and filled-in data', async () => {
            const module = await compileAssemblyScript(`
                export function testReadMessageData(message: Message, index: i32): i32 {
                    return message.dataView.getInt32(index * sizeof<i32>())
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)
            const engine = module.instance.exports as any
            
            const messagePointer = lowerMessage(engine, [
                'bla', 2.3
            ])

            // Testing datum count
            assert.strictEqual(engine.testReadMessageData(messagePointer, 0), 2)

            // Testing datum types
            assert.strictEqual(engine.testReadMessageData(messagePointer, 1), 1)
            assert.strictEqual(engine.testReadMessageData(messagePointer, 2), 0)

            // Testing datum positions
            // <Header byte size> 
            //      + <Size of f32> 
            //      + <Size of 3 chars strings> + <Size of f32>            
            assert.strictEqual(engine.testReadMessageData(messagePointer, 3), 6 * INT_ARRAY_BYTES_PER_ELEMENT)
            assert.strictEqual(engine.testReadMessageData(messagePointer, 4), 9 * INT_ARRAY_BYTES_PER_ELEMENT)
            assert.strictEqual(engine.testReadMessageData(messagePointer, 5), 10 * INT_ARRAY_BYTES_PER_ELEMENT)

            // DATUM "bla"
            assert.strictEqual(engine.testReadMessageData(messagePointer, 6), 'bla'.charCodeAt(0))
            assert.strictEqual(engine.testReadMessageData(messagePointer, 7), 'bla'.charCodeAt(1))
            assert.strictEqual(engine.testReadMessageData(messagePointer, 8), 'bla'.charCodeAt(2))

            // DATUM "2.3"
            assert.strictEqual(engine.testReadMessageData(messagePointer, 9), float32ToInt32(2.3))
        })

    })

    describe('liftMessage', () => {

        it('should read message to a JavaScript array', async () => {
            const module = await compileAssemblyScript(`
                export function testCreateMessage(): Message {
                    const message: Message = Message.fromTemplate([
                        MESSAGE_DATUM_TYPE_STRING, 5,
                        MESSAGE_DATUM_TYPE_FLOAT,
                    ])
                    writeStringDatum(message, 0, "hello")
                    writeFloatDatum(message, 1, 666)
                    return message
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)

            const messagePointer = (module.instance.exports as any).testCreateMessage()
            assert.deepStrictEqual(liftMessage(engine, messagePointer), ['hello', 666])
        })

    })

})