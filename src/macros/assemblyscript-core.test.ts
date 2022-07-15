import { readFileSync } from 'fs'
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { compileAssemblyScript } from '../test-helpers';
import assert from 'assert'
import { AssemblyScriptWasmEngine } from '../types';
import { INT_ARRAY_BYTES_PER_ELEMENT, liftArrayBufferOfIntegers, liftMessage, lowerArrayBufferOfIntegers, lowerMessage } from '../wasm-helpers';
import { InternalPointer } from './assemblyscript-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename)

const assemblyscriptCoreCode = readFileSync(resolve(__dirname, 'assemblyscript-core.asc')).toString()

describe('assemblyscriptCoreCode', () => {

    const ASSEMBLY_SCRIPT_CORE_CODE = assemblyscriptCoreCode
        .replace('${FloatType}', 'f32')
        .replace('${getFloat}', 'getFloat32')
        .replace('${setFloat}', 'setFloat32') + `
        export function testGetMessageBuffer(message: Message): ArrayBuffer {
            return message.dataView.buffer
        }
    `

    const float32ToInt32 = (value: number) => {
        const dataView = new DataView(new ArrayBuffer(4))
        dataView.setFloat32(0, value)
        return dataView.getInt32(0)
    }

    const assertMessageRawContentsEqual = (
        engine: AssemblyScriptWasmEngine, 
        messagePointer: InternalPointer, 
        expected: Array<number>
    ) => {
        const messageBufferPointer = (engine as any).testGetMessageBuffer(messagePointer)
        assert.deepStrictEqual(liftArrayBufferOfIntegers(engine, messageBufferPointer), expected)
    }

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

    describe('liftArrayBufferOfIntegers', () => {

        it('should correctly lift the given array buffer of intergers to an array', async () => {
            const module = await compileAssemblyScript(`
                export function testCreateBuffer(): ArrayBuffer {
                    const dataView: DataView = new DataView(new ArrayBuffer(sizeof<i32>() * 4))
                    dataView.setInt32(0 * sizeof<i32>(), 1)
                    dataView.setInt32(1 * sizeof<i32>(), 22)
                    dataView.setInt32(2 * sizeof<i32>(), 333)
                    dataView.setInt32(3 * sizeof<i32>(), 4444)
                    return dataView.buffer
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)
            const bufferPointer = (engine as any).testCreateBuffer()
            const array = liftArrayBufferOfIntegers(engine, bufferPointer)
            assert.deepStrictEqual(array, [
                1, 22, 333, 4444
            ])
        })

    })

    describe('lowerMessage', () => {

        it('should create the message with correct header and filled-in data', async () => {
            const module = await compileAssemblyScript(ASSEMBLY_SCRIPT_CORE_CODE)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)
            
            const messagePointer = lowerMessage(engine, [
                'bla', 2.3
            ])

            assertMessageRawContentsEqual(engine, messagePointer, [
                // Testing datum count
                2,

                // Testing datum types
                1, 0,
                
                // Testing datum positions
                // <Header byte size> 
                //      + <Size of f32> 
                //      + <Size of 3 chars strings> + <Size of f32>
                6 * INT_ARRAY_BYTES_PER_ELEMENT, 
                9 * INT_ARRAY_BYTES_PER_ELEMENT,
                10 * INT_ARRAY_BYTES_PER_ELEMENT,

                // DATUM "bla"
                'bla'.charCodeAt(0), 'bla'.charCodeAt(1), 'bla'.charCodeAt(2), 

                // DATUM "2.3"
                float32ToInt32(2.3),
            ])
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

    describe('createMessageArray / pushMessageToArray', () => {

        it('should create message array and push message to array', async () => {
            const module = await compileAssemblyScript(`
                export function testMessageArray(messageArray: Message[], index: i32): Message {
                    return messageArray[index]
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)
            const engine = (module.instance.exports as unknown as AssemblyScriptWasmEngine)
            
            const messagePointer1 = lowerMessage(engine, ['\x00\x00'])
            const messagePointer2 = lowerMessage(engine, [0])

            const messageArrayPointer = engine.createMessageArray()
            engine.pushMessageToArray(messageArrayPointer, messagePointer1)
            engine.pushMessageToArray(messageArrayPointer, messagePointer2)

            const messagePointer1Bis: number = (engine as any).testMessageArray(messageArrayPointer, 0)
            const messagePointer2Bis: number = (engine as any).testMessageArray(messageArrayPointer, 1)

            assertMessageRawContentsEqual(engine, messagePointer1Bis, [
                1, engine.MESSAGE_DATUM_TYPE_STRING.valueOf(), 4 * INT_ARRAY_BYTES_PER_ELEMENT, 6 * INT_ARRAY_BYTES_PER_ELEMENT, 0, 0
            ])
            assertMessageRawContentsEqual(engine, messagePointer2Bis, [
                1, engine.MESSAGE_DATUM_TYPE_FLOAT.valueOf(), 4 * INT_ARRAY_BYTES_PER_ELEMENT, 5 * INT_ARRAY_BYTES_PER_ELEMENT, 0
            ])
        })
    })

})