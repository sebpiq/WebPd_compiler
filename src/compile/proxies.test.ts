import assert from 'assert'
import { AssignerSpec, Assigner, ProtectedIndex, PrecompileNodeNamespace } from './proxies'

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

        const spec: AssignerSpec<Type, {}> = Assigner.Interface({
            a: Assigner.Index(
                (k: string) => Assigner.Literal(() => ({ b: 1, c: 2 })),
                () => ProtectedIndex({})
            ),
        })

        const obj = {}
        const assigner = Assigner<Type, {}>(spec, {}, obj)
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

        const someSpec: AssignerSpec<SomeType, Context> = Assigner.Interface({
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

        describe('Assigner.initializeAssignerTarget', () => {
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
                        indexConstructor: () => ({}),
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
                    bli: Assigner.LiteralDefaultNull(() => `123`),
                },
            }

            it('should initialize the given structure with simple dictionnaries of keys', () => {
                const obj = Assigner.ensureValue<SomeType, Context>(
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
                const obj = Assigner.ensureValue<SomeOtherType, Context>(
                    {},
                    someOtherSpec
                )
                assert.deepStrictEqual(obj, { bli: {}, ble: 456 })
            })

            it('should merge keep existing data', () => {
                const obj = Assigner.ensureValue<SomeOtherType, Context>(
                    { bli: { a: '123' } },
                    someOtherSpec
                )
                assert.deepStrictEqual(obj, { bli: { a: '123' }, ble: 456 })
            })

            it('should return null for LiteralDefaultNull', () => {
                const obj = Assigner.ensureValue<TypeWithDefault, Context>(
                    {},
                    someSpecWithDefaultNull
                )
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
                Assigner.Index((k1: string) =>
                    Assigner.Index((k2: string) =>
                        Assigner.Literal(() => `${k1}_${k2}`)
                    )
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
                    bla: Assigner.Literal(() => `123`),
                    bli: Assigner.LiteralDefaultNull(() => `456`),
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

        it('should pass path to Literal constructor', () => {
            interface TypeWithDefault {
                bla: string
            }

            const someSpecWithDefaultNull: AssignerSpec<TypeWithDefault, {}> = {
                Interface: {
                    bla: Assigner.Literal((path) =>
                        [path.keys, `123`].join('.')
                    ),
                },
            }

            const obj = {}
            Assigner(someSpecWithDefaultNull, {}, obj)

            assert.deepStrictEqual(obj, { bla: 'bla.123' })
        })

        it('should support calling with context object', () => {
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
            > = Assigner.Index(() => Assigner.Literal(() => ({})))

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
            > = Assigner.Interface({
                bla: Assigner.Literal(() => ({
                    blo: 123,
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

        it('should instantiate Index object with indexConstructor parameter', () => {
            interface SomeTypeWithChainedIndexes {
                a: {
                    [k1: string]: string
                }
            }

            const spec: AssignerSpec<SomeTypeWithChainedIndexes, {}> =
                Assigner.Interface({
                    a: Assigner.Index(
                        (k1: string) =>
                            Assigner.Literal(() => k1.toLowerCase()),
                        (path) => ({ HELLO: [...path.keys, 'hello'].join('.') })
                    ),
                })

            const obj = {} as SomeTypeWithChainedIndexes
            const assigner = Assigner(spec, {}, obj)
            assigner.a.BYE

            assert.deepStrictEqual(obj.a, {
                HELLO: 'a.hello',
                BYE: 'bye',
            })
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

    describe('PrecompileNodeNamespace', () => {
        describe('get', () => {
            it('should proxy access to exisinting keys', () => {
                const namespace = PrecompileNodeNamespace({
                    bla: '1',
                    hello: '2',
                }, '', '')
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.hello, '2')
            })

            it('should create automatic $ alias for keys starting with a number', () => {
                const namespace: { [key: string]: string } =
                    PrecompileNodeNamespace({
                        '0': 'blabla',
                        '0_bla': 'bloblo',
                    }, '', '')
                assert.strictEqual(namespace.$0, 'blabla')
                assert.strictEqual(namespace.$0_bla, 'bloblo')
            })

            it('should throw error when trying to access unknown key', () => {
                const namespace: { [key: string]: string } =
                    PrecompileNodeNamespace({
                        bla: '1',
                        hello: '2',
                    }, 'someId', 'someName')
                assert.throws(() => namespace.blo, /namespace <someId.someName> doesn't know key "blo"/)
            })

            it('should not prevent from using JSON stringify', () => {
                const namespace: { [key: string]: string } =
                    PrecompileNodeNamespace({
                        bla: '1',
                        hello: '2',
                    }, '', '')
                assert.deepStrictEqual(
                    JSON.stringify(namespace),
                    '{"bla":"1","hello":"2"}'
                )
            })
        })

        describe('set', () => {
            it('should throw error when trying to write any key', () => {
                const namespace: { [key: string]: string } =
                    PrecompileNodeNamespace({}, '', '')
                assert.throws(() => (namespace.bla = '2'))
            })
        })
    })
})
