/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd 
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { AstRaw, Class, ConstVar, Func, Var } from '../ast/declare'
import {
    GlobalCodeGenerator,
    GlobalCodeGeneratorWithSettings,
} from '../compile/types'

export const bufCore: GlobalCodeGenerator = () => AstRaw([
    /**
     * Ring buffer 
     */
    Class('buf_SoundBuffer', [
        Var('FloatArray', 'data'),
        Var('Int', 'length'),
        Var('Int', 'writeCursor'),
        Var('Int', 'pullAvailableLength'),
    ]),

    /** Erases all the content from the buffer */
    Func('buf_clear', [
        Var('buf_SoundBuffer', 'buffer')
    ], 'void')`
        buffer.data.fill(0)
    `,

    /** Erases all the content from the buffer */
    Func('buf_create', [
        Var('Int', 'length')
    ], 'buf_SoundBuffer')`
        return {
            data: createFloatArray(length),
            length: length,
            writeCursor: 0,
            pullAvailableLength: 0,
        }
    `
])

export const bufPushPull: GlobalCodeGeneratorWithSettings = {
    codeGenerator: () => AstRaw([
        /**
         * Pushes a block to the buffer, throwing an error if the buffer is full. 
         * If the block is written successfully, {@link buf_SoundBuffer#writeCursor} 
         * is moved corresponding with the length of data written.
         * 
         * @todo : Optimize by allowing to read/write directly from host
         */
        Func('buf_pushBlock', [
            Var('buf_SoundBuffer', 'buffer'), 
            Var('FloatArray', 'block')
        ], 'Int')`
            if (buffer.pullAvailableLength + block.length > buffer.length) {
                throw new Error('buffer full')
            }

            ${Var('Int', 'left', 'block.length')}
            while (left > 0) {
                ${ConstVar('Int', 'lengthToWrite', `toInt(Math.min(
                    toFloat(buffer.length - buffer.writeCursor), 
                    toFloat(left),
                ))`)}
                buffer.data.set(
                    block.subarray(
                        block.length - left, 
                        block.length - left + lengthToWrite
                    ), 
                    buffer.writeCursor
                )
                left -= lengthToWrite
                buffer.writeCursor = (buffer.writeCursor + lengthToWrite) % buffer.length
                buffer.pullAvailableLength += lengthToWrite
            }
            return buffer.pullAvailableLength
        `,
    
        /**
         * Pulls a single sample from the buffer. 
         * This is a destructive operation, and the sample will be 
         * unavailable for subsequent readers with the same operation.
         */
        Func('buf_pullSample', [
            Var('buf_SoundBuffer', 'buffer')
        ], 'Float')`
            if (buffer.pullAvailableLength <= 0) {
                return 0
            }
            ${ConstVar('Int', 'readCursor', 'buffer.writeCursor - buffer.pullAvailableLength')}
            buffer.pullAvailableLength -= 1
            return buffer.data[readCursor >= 0 ? readCursor : buffer.length + readCursor]
        `
    ]),
    dependencies: [bufCore],
}

export const bufWriteRead: GlobalCodeGeneratorWithSettings = {
    codeGenerator: () => AstRaw([
        /**
         * Writes a sample at \`@link writeCursor\` and increments \`writeCursor\` by one.
         */
        Func('buf_writeSample', [
            Var('buf_SoundBuffer', 'buffer'), 
            Var('Float', 'value')
        ], 'void')`
            buffer.data[buffer.writeCursor] = value
            buffer.writeCursor = (buffer.writeCursor + 1) % buffer.length
        `,

        /**
         * Reads the sample at position \`writeCursor - offset\`.
         * @param offset Must be between 0 (for reading the last written sample)
         *  and {@link buf_SoundBuffer#length} - 1. A value outside these bounds will not cause 
         *  an error, but might cause unexpected results.
         */
        Func('buf_readSample', [
            Var('buf_SoundBuffer', 'buffer'), 
            Var('Int', 'offset')
        ], 'Float')`
            // R = (buffer.writeCursor - 1 - offset) -> ideal read position
            // W = R % buffer.length -> wrap it so that its within buffer length bounds (but could be negative)
            // (W + buffer.length) % buffer.length -> if W negative, (W + buffer.length) shifts it back to positive.
            return buffer.data[(buffer.length + ((buffer.writeCursor - 1 - offset) % buffer.length)) % buffer.length]
        `
    ]),
    dependencies: [bufCore],
}
