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
import { RawModuleWithNameMapping, attachBindings } from './run-helpers'

describe('modules-helpers', () => {
    describe('attachBindings', () => {
        it('should read undefined for binding that is not declared', () => {
            const module = attachBindings(
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
            const module = attachBindings(
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
            const module = attachBindings(
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
            const module = attachBindings(
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
            const module = attachBindings(
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

        it('should support in operator', () => {
            const module = attachBindings(
                { bla: 'bli', blo: 'blu' },
                {
                    bla: {
                        type: 'raw',
                    },
                }
            )
            assert.ok('bla' in module)
            assert.ok(!('blo' in module))
        })

        it('should throw error for reading raw attribute that is not defined', () => {
            const module = attachBindings(
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
            const module = attachBindings(
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
            const module = attachBindings(
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

    describe('RawModuleWithNameMapping', () => {
        it('should use the name mapping to return the value', () => {
            const rawModule = {
                blo: 'BLO',
                bla: 'BLA',
            }
            const variableNamesIndex = {
                a: {
                    e: 'blo',
                },
                i: {
                    o: 'bla',
                },
            }
            const rawModuleWithMapping = RawModuleWithNameMapping<
                typeof variableNamesIndex
            >(rawModule, variableNamesIndex)

            assert.strictEqual(rawModuleWithMapping.a.e, 'BLO')
            assert.strictEqual(rawModuleWithMapping.i.o, 'BLA')
        })

        it('should directly return the value if it exists in the raw module', () => {
            const rawModule = {
                blo: 'BLO',
            }
            const variableNamesIndex = {
                a: {
                    e: 'blo',
                },
            }
            const rawModuleWithMapping = RawModuleWithNameMapping<
                typeof variableNamesIndex & typeof rawModule
            >(rawModule, variableNamesIndex)

            assert.strictEqual(rawModuleWithMapping.blo, 'BLO')
        })

        it('should raise an error if key is not found', () => {
            const rawModule = {
                blo: 'BLO',
            }
            const variableNamesIndex = {
                a: {
                    e: 'blo',
                },
            }
            const rawModuleWithMapping = RawModuleWithNameMapping(rawModule, variableNamesIndex)
            assert.throws(() => (rawModuleWithMapping as any).UNKNOWN)
        })

        it('should raise an error if nested key is not found', () => {
            const rawModule = {
                blo: 'BLO',
            }
            const variableNamesIndex = {
                a: {
                    e: 'blo',
                },
            }
            const rawModuleWithMapping = RawModuleWithNameMapping(rawModule, variableNamesIndex)
            assert.throws(() => (rawModuleWithMapping as any).a.UNKNOWN)
        })

        it('should support in operator in the name mapping', () => {
            const rawModule = {
                blo: 'BLO',
            }
            const variableNamesIndex = {
                a: {
                    e: 'blo',
                },
            }
            const rawModuleWithMapping = RawModuleWithNameMapping<
                typeof variableNamesIndex
            >(rawModule, variableNamesIndex)

            assert.ok('a' in rawModuleWithMapping)
            assert.ok('e' in rawModuleWithMapping.a)
        })

        it('should support in operator in the raw module', () => {
            const rawModule = {
                blo: 'BLO',
            }
            const variableNamesIndex = {}
            const rawModuleWithMapping = RawModuleWithNameMapping<
                typeof variableNamesIndex
            >(rawModule, variableNamesIndex)

            assert.ok('blo' in rawModuleWithMapping)
        })

        it('should support setting the value with the name mapping', () => {
            const rawModule = {
                blo: 'BLO',
            }
            const variableNamesIndex = {
                a: {
                    e: 'blo',
                },
            }
            const rawModuleWithMapping = RawModuleWithNameMapping<
                typeof variableNamesIndex
            >(rawModule, variableNamesIndex)

            rawModuleWithMapping.a.e = 'new_blo'
            assert.strictEqual(rawModuleWithMapping.a.e, 'new_blo')
        })
    })
})
