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

import { assertMessageRawContentsEqual, compileAssemblyScript, getAssemblyscriptCoreCode } from './test-helpers';
import {jest} from '@jest/globals'
import { AssemblyScriptWasmEngine } from './types';
import { INT_ARRAY_BYTES_PER_ELEMENT, lowerMessage } from './bindings';

describe('assemblyscriptCoreCode', () => {
    jest.setTimeout(10000)

    const ASSEMBLY_SCRIPT_CORE_CODE = getAssemblyscriptCoreCode()

    describe('createMessageArray / pushMessageToArray', () => {

        it.only('should create message array and push message to array', async () => {
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