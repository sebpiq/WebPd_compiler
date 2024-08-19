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
import {
    AssignerSpec,
    Assigner,
    ProtectedIndex,
    ReadOnlyIndexWithDollarKeys,
    ReadOnlyIndex,
} from './proxies'

describe('proxies', () => {
    it('Assigner and ProtectedIndex should be working together', () => {
        interface Type {
            a: {
                [k: string]: {
                    b: number
                    c: number
                }
            }
        }

        const spec: AssignerSpec<Type> = Assigner.Interface({
            a: Assigner.Index(
                (k: string) => Assigner.Literal(() => ({ b: 1, c: 2 })),
                () => ProtectedIndex({})
            ),
        })

        const obj = {}
        const assigner = Assigner<Type>(spec, obj, undefined)
        assert.deepStrictEqual(assigner.a.bla, {
            b: 1,
            c: 2,
        })

        // Try second time because ProtectedIndex throws an error if trying to
        // overwrite an existing key
        assert.deepStrictEqual(assigner.a.bla, {
            b: 1,
            c: 2,
        })
    })

    describe('Assigner', () => {
        describe('Assigner.ensureValue', () => {
            it('should initialize Interfaces', () => {
                interface SomeType {
                    bla: {
                        blo: {
                            [k: string]: {
                                bli: {
                                    [k: string]: string
                                }
                                ble: number
                            }
                        }
                    }
                }

                const someSpec: AssignerSpec<SomeType> = Assigner.Interface({
                    bla: Assigner.Interface({
                        blo: Assigner.Index((k1: string) =>
                            Assigner.Interface({
                                bli: Assigner.Index((k2: string) =>
                                    Assigner.Literal(() => `${k1}_${k2}`)
                                ),
                                ble: Assigner.Literal(() => parseInt(k1, 10)),
                            })
                        ),
                    }),
                })

                assert.deepStrictEqual(
                    Assigner.ensureValue<SomeType>({}, someSpec, undefined),
                    {
                        bla: {
                            blo: {},
                        },
                    }
                )
            })

            it('should initialize Interface with nested Index', () => {
                interface SomeType {
                    bli: {
                        [k: string]: string
                    }
                    ble: number
                }

                const someSpec: AssignerSpec<SomeType> = Assigner.Interface({
                    bli: Assigner.Index(() => Assigner.Literal(() => `123`)),
                    ble: Assigner.Literal(() => 456),
                })

                assert.deepStrictEqual(
                    Assigner.ensureValue<SomeType>({}, someSpec, undefined),
                    { bli: {}, ble: 456 }
                )
            })

            it('should keep existing data in Index', () => {
                type SomeType = {
                    [k: string]: string
                }

                const someSpec: AssignerSpec<SomeType> = Assigner.Index(() =>
                    Assigner.Literal(() => `123`)
                )

                assert.deepStrictEqual(
                    Assigner.ensureValue<SomeType>(
                        { a: '123' },
                        someSpec,
                        undefined
                    ),
                    { a: '123' }
                )
            })

            it('should instantiate Index object with indexConstructor parameter', () => {
                type SomeType = {
                    a: {
                        [k: string]: string
                    }
                }

                const spec: AssignerSpec<SomeType, string> = Assigner.Interface(
                    {
                        a: Assigner.Index(
                            (k: string) => Assigner.Literal(() => k),
                            // Create Index with an existing entry
                            (context, path) => ({
                                HELLO: [context, ...path.keys, 'hello'].join(
                                    '.'
                                ),
                            })
                        ),
                    }
                )

                assert.deepStrictEqual(
                    Assigner.ensureValue(undefined, spec, 'CONTEXT'),
                    {
                        a: {
                            HELLO: 'CONTEXT.a.hello',
                        },
                    }
                )
            })

            it('should pass path and context to Literal', () => {
                interface SomeType {
                    bla: string
                }

                const someSpec: AssignerSpec<SomeType, string> = {
                    Interface: {
                        bla: Assigner.Literal((context, path) =>
                            [context, ...path.keys, `123`].join('.')
                        ),
                    },
                }

                assert.deepStrictEqual(
                    Assigner.ensureValue(undefined, someSpec, 'CONTEXT'),
                    { bla: 'CONTEXT.bla.123' }
                )
            })

            it('should pass path and context to LiteralDefaultNull', () => {
                const someSpec: AssignerSpec<string | null, string> =
                    Assigner.LiteralDefaultNull((context, path) =>
                        [context, ...path.keys, `123`].join('.')
                    )

                assert.strictEqual(
                    Assigner.ensureValue(undefined, someSpec, 'CONTEXT', {
                        keys: ['bla'],
                        parents: [],
                    }),
                    'CONTEXT.bla.123'
                )
            })

            it('should initialize with null for LiteralDefaultNull', () => {
                interface TypeWithDefault {
                    bli: string | null
                }

                const someSpecWithDefaultNull: AssignerSpec<TypeWithDefault> = {
                    Interface: {
                        bli: Assigner.LiteralDefaultNull(() => `123`),
                    },
                }

                const obj = Assigner.ensureValue<TypeWithDefault>(
                    {},
                    someSpecWithDefaultNull,
                    undefined
                )
                assert.deepStrictEqual(obj, { bli: null })
            })
        })

        it('should create all defaults when being accessed', () => {
            interface SomeType {
                bla: {
                    blo: {
                        [k: string]: {
                            bli: {
                                [k: string]: string
                            }
                            ble: number
                        }
                    }
                }
            }

            interface Context {
                someValue: string
            }

            const someSpec: AssignerSpec<SomeType, Context> =
                Assigner.Interface({
                    bla: Assigner.Interface({
                        blo: Assigner.Index((k1: string) =>
                            Assigner.Interface({
                                bli: Assigner.Index((k2: string) =>
                                    Assigner.Literal(() => `${k1}_${k2}`)
                                ),
                                ble: Assigner.Literal(() => parseInt(k1, 10)),
                            })
                        ),
                    }),
                })

            const obj = {}
            const assigner = Assigner(someSpec, obj, { someValue: '123' })

            const bli456 = assigner.bla.blo['123']!.bli['456']!
            assert.strictEqual(bli456, '123_456')

            const bli789 = assigner.bla.blo['123']!.bli['789']!
            assert.strictEqual(bli789, '123_789')

            const ble456Ns = assigner.bla.blo['456']!

            assert.deepStrictEqual(obj, {
                bla: {
                    blo: {
                        '123': {
                            bli: {
                                '456': '123_456',
                                '789': '123_789',
                            },
                            ble: 123,
                        },
                        '456': {
                            bli: {},
                            ble: 456,
                        },
                    },
                },
            })

            assert.deepStrictEqual(ble456Ns.ble, 456)
        })

        it('should support 2 Index chained after each other', () => {
            interface SomeTypeWithChainedIndexes {
                [k1: string]: {
                    [k2: string]: string
                }
            }

            interface Context {
                someValue: string
            }

            const spec: AssignerSpec<SomeTypeWithChainedIndexes, Context> =
                Assigner.Index((k1: string) =>
                    Assigner.Index((k2: string) =>
                        Assigner.Literal(() => `${k1}_${k2}`)
                    )
                )

            const obj = {}
            const assigner = Assigner(spec, obj, { someValue: '123' })

            assert.strictEqual(assigner.hello!.bonjour!, 'hello_bonjour')
            assert.strictEqual(assigner.hello!.ola!, 'hello_ola')
            assert.strictEqual(assigner.bye!.salut!, 'bye_salut')
            assert.deepStrictEqual(obj, {
                hello: {
                    bonjour: 'hello_bonjour',
                    ola: 'hello_ola',
                },
                bye: {
                    salut: 'bye_salut',
                },
            })
        })

        it('should support LiteralDefaultNull', () => {
            interface TypeWithDefault {
                bla: string
                bli: string | null
            }

            interface Context {
                someValue: string
            }

            const someSpecWithDefaultNull: AssignerSpec<
                TypeWithDefault,
                Context
            > = {
                Interface: {
                    bla: Assigner.Literal(() => `123`),
                    bli: Assigner.LiteralDefaultNull(() => `456`),
                },
            }

            const obj = {}
            const assigner = Assigner(someSpecWithDefaultNull, obj, {
                someValue: '123',
            })

            assert.strictEqual(assigner.bla, '123')
            assert.deepStrictEqual(obj, { bla: '123', bli: null })
            assert.strictEqual(assigner.bli, '456')
            assert.deepStrictEqual(obj, { bla: '123', bli: '456' })
        })

        it('should support calling with context object', () => {
            interface SomeType {
                bla: {
                    blo: {
                        [k: string]: {
                            bli: {
                                [k: string]: string
                            }
                            ble: number
                        }
                    }
                }
            }

            interface Context {
                someValue: string
            }

            const obj = {}

            const someSpec: AssignerSpec<SomeType, Context> =
                Assigner.Interface({
                    bla: Assigner.Interface({
                        blo: Assigner.Index((k1: string, context: Context) =>
                            Assigner.Interface({
                                bli: Assigner.Index((k2: string) =>
                                    Assigner.Literal(
                                        () => `${k1}_${k2}_${context.someValue}`
                                    )
                                ),
                                ble: Assigner.Literal(() => parseInt(k1, 10)),
                            })
                        ),
                    }),
                })

            const assigner = Assigner(someSpec, obj, { someValue: 'hello' })

            const bli456 = assigner.bla.blo['123']!.bli['456']!
            assert.strictEqual(bli456, '123_456_hello')

            assert.deepStrictEqual(obj, {
                bla: {
                    blo: {
                        '123': {
                            bli: {
                                '456': '123_456_hello',
                            },
                            ble: 123,
                        },
                    },
                },
            })
        })

        it('should keep instantiated Literals and not reinstantiate', () => {
            type TypeWithObjectLiteral = {
                [k: string]: { [k: string]: number }
            }

            const someSpecWithObjectLiteral: AssignerSpec<TypeWithObjectLiteral> =
                Assigner.Index(() => Assigner.Literal(() => ({})))

            const obj = {}
            const assigner = Assigner(someSpecWithObjectLiteral, obj, undefined)

            assigner.bla!.hello = 123
            assigner.bla!.hi = 456

            assert.deepStrictEqual(obj, {
                bla: {
                    hello: 123,
                    hi: 456,
                },
            })
        })

        it('should instantiate new instance for Literal with new object', () => {
            type TypeWithObjectLiteral = {
                bla: { blo: number }
            }

            const someSpecWithObjectLiteral: AssignerSpec<TypeWithObjectLiteral> =
                Assigner.Interface({
                    bla: Assigner.Literal(() => ({
                        blo: 123,
                    })),
                })

            const obj1 = {}
            const assigner1 = Assigner(
                someSpecWithObjectLiteral,
                obj1,
                undefined
            )
            assigner1.bla.blo = 456

            assert.deepStrictEqual(obj1, {
                bla: {
                    blo: 456,
                },
            })

            const obj2 = {}
            Assigner(someSpecWithObjectLiteral, obj2, undefined)
            assert.deepStrictEqual(obj2, {
                bla: {
                    blo: 123,
                },
            })
        })

        it('should throw an error for an unknown key in Interface', () => {
            interface SomeType {
                bla: string
            }

            const someSpec: AssignerSpec<SomeType> = Assigner.Interface({
                bla: Assigner.Literal(() => '123'),
            })

            const obj = {}
            const assigner = Assigner(someSpec, obj, undefined)

            assert.strictEqual(assigner.bla, '123')
            assert.throws(
                () => (assigner as any).blo,
                /Interface has no entry "blo"/
            )
        })
    })

    describe('ProtectedIndex', () => {
        describe('get', () => {
            it('should proxy access to exisinting keys', () => {
                const namespace = ProtectedIndex({
                    bla: '1',
                    hello: '2',
                })
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.hello, '2')
            })

            it('should throw error when trying to access unknown key', () => {
                const namespace: { [key: string]: string } = ProtectedIndex({
                    bla: '1',
                    hello: '2',
                })
                assert.throws(() => namespace.blo)
            })

            it('should not prevent from using JSON stringify', () => {
                const namespace: { [key: string]: string } = ProtectedIndex({
                    bla: '1',
                    hello: '2',
                })
                assert.deepStrictEqual(
                    JSON.stringify(namespace),
                    '{"bla":"1","hello":"2"}'
                )
            })
        })

        describe('set', () => {
            it('should allow setting a key that doesnt aready exist', () => {
                const namespace: { [key: string]: string } = ProtectedIndex({
                    bla: '1',
                })
                namespace.blo = '2'
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.blo, '2')
            })

            it('should throw error when trying to overwrite existing key', () => {
                const namespace: { [key: string]: string } = ProtectedIndex({
                    bla: '1',
                })
                assert.throws(() => (namespace.bla = '2'))
            })
        })
    })

    describe('ReadOnlyIndexWithDollarKeys', () => {
        describe('get', () => {
            it('should proxy access to exisinting keys', () => {
                const namespace = ReadOnlyIndexWithDollarKeys(
                    {
                        bla: '1',
                        hello: '2',
                    },
                    '',
                    ''
                )
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.hello, '2')
            })

            it('should create automatic $ alias for keys starting with a number', () => {
                const namespace: { [key: string]: string } =
                    ReadOnlyIndexWithDollarKeys(
                        {
                            '0': 'blabla',
                            '0_bla': 'bloblo',
                        },
                        '',
                        ''
                    )
                assert.strictEqual(namespace.$0, 'blabla')
                assert.strictEqual(namespace.$0_bla, 'bloblo')
            })

            it('should throw error when trying to access unknown key', () => {
                const namespace: { [key: string]: string } =
                    ReadOnlyIndexWithDollarKeys(
                        {
                            bla: '1',
                            hello: '2',
                        },
                        'someId',
                        'someName'
                    )
                assert.throws(
                    () => namespace.blo,
                    /namespace <someId.someName> doesn't know key "blo"/
                )
            })

            it('should not prevent from using JSON stringify', () => {
                const namespace: { [key: string]: string } =
                    ReadOnlyIndexWithDollarKeys(
                        {
                            bla: '1',
                            hello: '2',
                        },
                        '',
                        ''
                    )
                assert.deepStrictEqual(
                    JSON.stringify(namespace),
                    '{"bla":"1","hello":"2"}'
                )
            })
        })

        describe('set', () => {
            it('should throw error when trying to write any key', () => {
                const namespace: { [key: string]: string } =
                    ReadOnlyIndexWithDollarKeys({}, '', '')
                assert.throws(() => (namespace.bla = '2'))
            })
        })
    })

    describe('ReadOnlyIndex', () => {
        describe('get', () => {
            it('should work with nested index', () => {
                const namespace = ReadOnlyIndex({
                    bla: {
                        hello: '1',
                    },
                })
                assert.throws(
                    () => (namespace as any).blo,
                    /namespace doesn't know key "blo"/
                )
                assert.throws(
                    () => (namespace.bla as any).bye!,
                    /namespace <bla> doesn't know key "bye"/
                )
            })
        })
    })
})
