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

import assert from 'assert'
import { createModule } from './modules-helpers'

describe('modules-helpers', () => {
    describe('createModule', () => {
        it('should read undefined for binding that is not declared', () => {
            const module = createModule(
                { blo: 'bli' },
                {
                    bla: {
                        type: 'raw',
                    },
                }
            )
            assert.strictEqual((module as any).blu, undefined)
            assert.strictEqual((module as any).blo, undefined)
        })

        it('should read raw attribute from the RawModule', () => {
            const module = createModule(
                { bla: 'bli' },
                {
                    bla: {
                        type: 'raw',
                    },
                }
            )
            assert.strictEqual(module.bla, 'bli')
        })

        it('should read proxied attribute from the bindings', () => {
            const module = createModule(
                { bla: 'bli' },
                {
                    bla: {
                        type: 'proxy',
                        value: 'blo',
                    },
                }
            )
            assert.strictEqual(module.bla, 'blo')
        })

        it('should read callback attribute from the bindings', () => {
            const blo = (): null => null
            const module = createModule(
                { bla: 'bli' },
                {
                    bla: {
                        type: 'callback',
                        value: blo,
                    },
                }
            )
            assert.strictEqual(module.bla, blo)
        })

        it('should allow writing callback', () => {
            const blo1 = (): null => null
            const blo2 = (): null => null
            const module = createModule(
                { bla: 'bli' },
                {
                    bla: {
                        type: 'callback',
                        value: blo1,
                    },
                }
            )
            module.bla = blo2
            assert.strictEqual(module.bla, blo2)
        })

        it('should throw error for reading raw attribute that is not defined', () => {
            const module = createModule(
                { blo: 'bli' },
                {
                    bla: {
                        type: 'raw',
                    },
                }
            )
            assert.throws(() => (module as any).bla)
        })

        it('should throw error for writing unknown attribute', () => {
            const module = createModule(
                { bla: 'bli' },
                {
                    bla: {
                        type: 'raw',
                    },
                }
            )
            assert.throws(() => ((module as any).blo = 'poi'))
        })

        it('should throw error for writing attribute that is not writable', () => {
            const module = createModule(
                { bla: 'bli' },
                {
                    bla: {
                        type: 'raw',
                    },
                }
            )
            assert.throws(() => ((module as any).bla = 'poi'))
        })
    })
})
