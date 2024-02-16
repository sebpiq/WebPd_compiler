import assert from 'assert'
import {
    AssignerSpec,
    Index,
    Literal,
    Interface,
    assignerInitializeDefaults,
    Assigner,
    LiteralDefaultNull,
} from './proxies'

describe('proxies', () => {
    describe('Assigner', () => {
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

        const someSpec: AssignerSpec<SomeType, Context> = Interface({
            bla: Interface({
                blo: Index((k1: string) =>
                    Interface({
                        bli: Index((k2: string) => Literal(() => `${k1}_${k2}`)),
                        ble: Literal(() => parseInt(k1, 10)),
                    })
                ),
            }),
        })

        describe('assignerInitializeDefaults', () => {
            interface SomeOtherType {
                bli: {
                    [k: string]: string
                }
                ble: number
            }

            const someOtherSpec: AssignerSpec<SomeOtherType, Context> = {
                Interface: {
                    bli: {
                        Index: () => ({
                            Literal: () => `123`,
                        }),
                    },
                    ble: {
                        Literal: () => 456,
                    },
                },
            }

            interface TypeWithDefault {
                bli: string | null
            }

            const someSpecWithDefaultNull: AssignerSpec<
                TypeWithDefault,
                Context
            > = {
                Interface: {
                    bli: LiteralDefaultNull(() => `123`),
                },
            }

            it('should initialize the given structure with simple dictionnaries of keys', () => {
                const obj = assignerInitializeDefaults<SomeType, Context>(
                    {},
                    someSpec
                )
                assert.deepStrictEqual(obj, {
                    bla: {
                        blo: {},
                    },
                })
            })

            it('should initialize the given structure when it declares a function ', () => {
                const obj = assignerInitializeDefaults<SomeOtherType, Context>(
                    {},
                    someOtherSpec
                )
                assert.deepStrictEqual(obj, { bli: {}, ble: 456 })
            })

            it('should merge keep existing data', () => {
                const obj = assignerInitializeDefaults<SomeOtherType, Context>(
                    { bli: { a: '123' } },
                    someOtherSpec
                )
                assert.deepStrictEqual(obj, { bli: { a: '123' }, ble: 456 })
            })

            it('should return null for LiteralDefaultNull', () => {
                const obj = assignerInitializeDefaults<
                    TypeWithDefault,
                    Context
                >({}, someSpecWithDefaultNull)
                assert.deepStrictEqual(obj, { bli: null })
            })
        })

        it('should create all defaults when being accessed', () => {
            const obj = {}
            const assigner = Assigner(someSpec, { someValue: '123' }, obj)

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

            const spec: AssignerSpec<SomeTypeWithChainedIndexes, Context> =
                Index((k1: string) =>
                    Index((k2: string) => Literal(() => `${k1}_${k2}`))
                )

            const obj = {}
            const assigner = Assigner(spec, { someValue: '123' }, obj)

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

            const someSpecWithDefaultNull: AssignerSpec<
                TypeWithDefault,
                Context
            > = {
                Interface: {
                    bla: Literal(() => `123`),
                    bli: LiteralDefaultNull(() => `456`),
                },
            }

            const obj = {}
            const assigner = Assigner(
                someSpecWithDefaultNull,
                { someValue: '123' },
                obj
            )

            assert.strictEqual(assigner.bla, '123')
            assert.deepStrictEqual(obj, { bla: '123', bli: null })
            assert.strictEqual(assigner.bli, '456')
            assert.deepStrictEqual(obj, { bla: '123', bli: '456' })
        })

        it('should support calling with context object', () => {
            const obj = {}

            const someSpec: AssignerSpec<SomeType, Context> = Interface({
                bla: Interface({
                    blo: Index((k1: string, context: Context) =>
                        Interface({
                            bli: Index((k2: string) =>
                                Literal(() => `${k1}_${k2}_${context.someValue}`)
                            ),
                            ble: Literal(() => parseInt(k1, 10)),
                        })
                    ),
                }),
            })

            const assigner = Assigner(someSpec, { someValue: 'hello' }, obj)

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

            const someSpecWithObjectLiteral: AssignerSpec<
                TypeWithObjectLiteral,
                {}
            > = Index(() => Literal(() => ({})))

            const obj = {}
            const assigner = Assigner(someSpecWithObjectLiteral, {}, obj)

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

            const someSpecWithObjectLiteral: AssignerSpec<
                TypeWithObjectLiteral,
                {}
            > = Interface({
                bla: Literal(() => ({
                    blo: 123
                })),
            })

            const obj1 = {}
            const assigner1 = Assigner(someSpecWithObjectLiteral, {}, obj1)
            assigner1.bla.blo = 456

            assert.deepStrictEqual(obj1, {
                bla: {
                    blo: 456,
                },
            })

            const obj2 = {}
            Assigner(someSpecWithObjectLiteral, {}, obj2)
            assert.deepStrictEqual(obj2, {
                bla: {
                    blo: 123,
                },
            })
        })
    })
})
