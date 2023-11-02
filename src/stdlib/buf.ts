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

import {
    GlobalCodeGenerator,
    GlobalCodeGeneratorWithSettings,
} from '../compile/types'

export const bufCore: GlobalCodeGenerator = ({ macros: { Var, Func } }) => `
    /**
     * Ring buffer 
     */
    class buf_SoundBuffer {
        ${Var('data', 'FloatArray')}
        ${Var('length', 'Int')}
        ${Var('writeCursor', 'Int')}
        ${Var('pullAvailableLength', 'Int')}

        constructor (${Var('length', 'Int')}) {
            this.length = length
            this.data = createFloatArray(length)
            this.writeCursor = 0
            this.pullAvailableLength = 0
        }
    }

    /** Erases all the content from the buffer */
    function buf_create ${Func([Var('length', 'Int')], 'buf_SoundBuffer')} {
        return new buf_SoundBuffer(length)
    }

    /** Erases all the content from the buffer */
    function buf_clear ${Func([Var('buffer', 'buf_SoundBuffer')], 'void')} {
        buffer.data.fill(0)
    }
`

export const bufPushPull: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        /**
         * Pushes a block to the buffer, throwing an error if the buffer is full. 
         * If the block is written successfully, {@link buf_SoundBuffer#writeCursor} 
         * is moved corresponding with the length of data written.
         * 
         * @todo : Optimize by allowing to read/write directly from host
         */
        function buf_pushBlock ${Func(
            [Var('buffer', 'buf_SoundBuffer'), Var('block', 'FloatArray')],
            'Int'
        )} {
            if (buffer.pullAvailableLength + block.length > buffer.length) {
                throw new Error('buffer full')
            }

            let ${Var('left', 'Int')} = block.length
            while (left > 0) {
                const lengthToWrite = toInt(Math.min(
                    toFloat(buffer.length - buffer.writeCursor), 
                    toFloat(left)
                ))
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
        }

        /**
         * Pulls a single sample from the buffer. 
         * This is a destructive operation, and the sample will be 
         * unavailable for subsequent readers with the same operation.
         */
        function buf_pullSample ${Func(
            [Var('buffer', 'buf_SoundBuffer')],
            'Float'
        )} {
            if (buffer.pullAvailableLength <= 0) {
                return 0
            }
            const ${Var(
                'readCursor',
                'Int'
            )} = buffer.writeCursor - buffer.pullAvailableLength
            buffer.pullAvailableLength -= 1
            return buffer.data[readCursor >= 0 ? readCursor : buffer.length + readCursor]
        }
    `,
    dependencies: [bufCore],
}

export const bufWriteRead: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        /**
         * Writes a sample at \`@link writeCursor\` and increments \`writeCursor\` by one.
         */
        function buf_writeSample ${Func(
            [Var('buffer', 'buf_SoundBuffer'), Var('value', 'Float')],
            'void'
        )} {
            buffer.data[buffer.writeCursor] = value
            buffer.writeCursor = (buffer.writeCursor + 1) % buffer.length
        }

        /**
         * Reads the sample at position \`writeCursor - offset\`.
         * @param offset Must be between 0 (for reading the last written sample)
         *  and {@link buf_SoundBuffer#length} - 1. A value outside these bounds will not cause 
         *  an error, but might cause unexpected results.
         */
        function buf_readSample ${Func(
            [Var('buffer', 'buf_SoundBuffer'), Var('offset', 'Int')],
            'Float'
        )} {
            // R = (buffer.writeCursor - 1 - offset) -> ideal read position
            // W = R % buffer.length -> wrap it so that its within buffer length bounds (but could be negative)
            // (W + buffer.length) % buffer.length -> if W negative, (W + buffer.length) shifts it back to positive.
            return buffer.data[(buffer.length + ((buffer.writeCursor - 1 - offset) % buffer.length)) % buffer.length]
        }
    `,
    dependencies: [bufCore],
}
