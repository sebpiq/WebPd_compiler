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

import { DspGraph } from '../dsp-graph/types'
import { makeGraph } from '../dsp-graph/test-helpers'
import assert from 'assert'
import {
    buildGraphTraversalDeclare,
    buildGraphTraversalLoop,
    collectExports,
    collectImports,
    getNodeImplementation,
    preCompileSignalAndMessageFlow,
} from './compile-helpers'
import { makeCompilation } from '../test-helpers'
import {
    GlobalCodeDefinition,
    GlobalCodeGeneratorWithSettings,
    NodeImplementation,
    NodeImplementations,
} from './types'

describe('compile-helpers', () => {
    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            someNodeType: { generateLoop: () => `` },
            boringNodeType: {},
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType')
                    .generateLoop,
                NODE_IMPLEMENTATIONS['someNodeType'].generateLoop
            )
        })

        it('should fill-in all fields with default functions', () => {
            const referenceImplementation: Required<NodeImplementation<any>> = {
                stateVariables: {},
                generateDeclarations: () => '',
                generateLoop: () => '',
                generateMessageReceivers: () => ({}),
                dependencies: [],
            }
            const defaultImplementation = getNodeImplementation(
                NODE_IMPLEMENTATIONS,
                'boringNodeType'
            )

            assert.deepStrictEqual(
                Object.entries(referenceImplementation).map(([name, obj]) => [
                    name,
                    typeof obj === 'function' ? (obj as any)() : obj,
                ]),
                Object.entries(defaultImplementation).map(([name, obj]) => [
                    name,
                    typeof obj === 'function' ? (obj as any)() : obj,
                ])
            )
        })

        it('should throw an error if implementation doesnt exist', () => {
            assert.throws(() =>
                getNodeImplementation(
                    NODE_IMPLEMENTATIONS,
                    'someUnknownNodeType'
                )
            )
        })
    })

    describe('preCompileSignalAndMessageFlow', () => {
        describe('signal INS/OUTS', () => {
            it('should substitute connected signal IN with its source OUT', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'signal' },
                        },
                        sinks: {
                            '0': [['node2', '0']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'signal' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1', 'node2'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.outs['0'],
                    'node1_OUTS_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node2.ins['0'],
                    'node1_OUTS_0'
                )
            })

            it('should put empty signal for unconnected IN', () => {
                const graph = makeGraph({
                    node1: {
                        inlets: {
                            '0': { id: '0', type: 'signal' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.ins['0'],
                    compilation.codeVariableNames.globs.nullSignal
                )
            })
        })

        describe('message SNDS', () => {
            it('should create SND if several sinks', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                        sinks: {
                            '0': [
                                ['node2', '0'],
                                ['node3', '0'],
                            ],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                    node3: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1', 'node2', 'node3'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.snds['0'],
                    'node1_SNDS_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.snds['0'],
                    'node1_SNDS_0'
                )
            })

            it("should substitute message SND with the sink's RCV if only one sink", () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                        sinks: {
                            '0': [['node2', '0']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1', 'node2'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node2.rcvs['0'],
                    'node2_RCVS_0'
                )
                assert.ok(
                    !('0' in compilation.codeVariableNames.nodes.node1.snds)
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.snds['0'],
                    'node2_RCVS_0'
                )
            })

            it('should NOT substitute message SND if an outlet listener is also specified', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                        sinks: {
                            '0': [['node2', '0']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1', 'node2'],
                    outletListenerSpecs: {
                        node1: ['0'],
                    },
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.snds['0'],
                    'node1_SNDS_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.snds['0'],
                    'node1_SNDS_0'
                )
            })

            it('should substitute SND with outlet listener if no sinks', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1'],
                    outletListenerSpecs: {
                        node1: ['0'],
                    },
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.outletListeners.node1['0'],
                    'outletListener_node1_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.snds['0'],
                    compilation.codeVariableNames.outletListeners.node1['0']
                )
            })

            it('should substitute SND with null function if no sink and not outlet listener', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.snds['0'],
                    compilation.codeVariableNames.globs.nullMessageReceiver
                )
            })
        })

        describe('message RCVS', () => {
            it('should declare message inlet when it has one or more sources', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                            '1': { id: '1', type: 'message' },
                        },
                        sinks: {
                            '0': [
                                ['node2', '0'],
                                ['node3', '0'],
                            ],
                            '1': [['node2', '0']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                    node3: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1', 'node2', 'node3'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node2.rcvs['0'],
                    'node2_RCVS_0'
                )
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node3.rcvs['0'],
                    'node3_RCVS_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node2.rcvs['0'],
                    'node2_RCVS_0'
                )
                assert.strictEqual(
                    compilation.precompilation.node3.rcvs['0'],
                    'node3_RCVS_0'
                )
            })

            it('should declare message inlet when outlet has several sinks', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                        sinks: {
                            '0': [
                                ['node2', '0'],
                                ['node3', '0'],
                            ],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                    node3: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1', 'node2', 'node3'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node2.rcvs['0'],
                    'node2_RCVS_0'
                )
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node3.rcvs['0'],
                    'node3_RCVS_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node2.rcvs['0'],
                    'node2_RCVS_0'
                )
                assert.strictEqual(
                    compilation.precompilation.node3.rcvs['0'],
                    'node3_RCVS_0'
                )
            })

            it('should remove message inlets when inlet has no source', () => {
                const graph = makeGraph({
                    node1: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1'],
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.ok(
                    !('0' in compilation.codeVariableNames.nodes.node1.rcvs)
                )
            })

            it('should keep message inlet when inlet caller is declared', () => {
                const graph = makeGraph({
                    node1: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    graph,
                    graphTraversalDeclare: ['node1'],
                    inletCallerSpecs: { node1: ['0'] },
                })

                preCompileSignalAndMessageFlow(compilation)

                // Variable declarations
                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.rcvs['0'],
                    'node1_RCVS_0'
                )

                // Precompilation
                assert.strictEqual(
                    compilation.precompilation.node1.rcvs['0'],
                    'node1_RCVS_0'
                )
            })
        })
    })

    describe('buildGraphTraversalDeclare', () => {
        it('should combine signal and message traversals and remove duplicates', () => {
            // [  n1  ]         [  n5  ]
            //    / \
            //   |  [  n2  ]
            //   |    /   \
            // [  n3  ]  [  n4  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    isPushingMessages: true,
                    sinks: {
                        '0': [['n3', '0']],
                        '1': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
                n3: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n5: {
                    isPushingMessages: true,
                },
            })
            const traversal = buildGraphTraversalDeclare(graph, {})
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal.sort(), [
                'n1',
                'n2',
                'n3',
                'n4',
                'n5',
            ])
        })

        it('should add nodes that have an inlet caller declared', () => {
            const graph = makeGraph({
                n1: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            const traversal = buildGraphTraversalDeclare(graph, {
                n1: ['0'],
            })
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal.sort(), [
                'n1',
                'n2',
            ])
        })
    })

    describe('buildGraphTraversalLoop', () => {
        it('should return signal traversal and remove duplicates', () => {
            // [  n1  ]
            //    / \
            //   |  [  n2  ]
            //   |    /   \
            // [  n3  ]  [  n4  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        '0': [['n3', '0']],
                        '1': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            const traversal = buildGraphTraversalLoop(graph)
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal, [
                'n1',
                'n2',
                'n3',
                'n4',
            ])
        })
    })

    describe('collectExports', () => {
        it('should collect exports recursively and remove duplicates', () => {
            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                exports: [{ name: 'ex1' }, { name: 'ex3' }],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                // no exports here shouldnt break the chain
                dependencies: [() => ``, codeDefinition1],
            }
            const codeDefinition3: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                exports: [{ name: 'ex4' }],
                dependencies: [codeDefinition2],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                () => ``,
                codeDefinition3,
            ]

            assert.deepStrictEqual(collectExports('javascript', dependencies), [
                { name: 'ex1' },
                { name: 'ex3' },
                { name: 'ex4' },
            ])
        })

        it('should keep only exports for specified target', () => {
            const codeGenerator1 = () => 'bla'
            const codeGenerator2 = () => 'bli'
            const codeGenerator3 = () => 'blo'

            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: codeGenerator1,
                exports: [
                    { name: 'ex1' },
                    { name: 'ex3', targets: ['javascript'] },
                ],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: codeGenerator2,
                exports: [
                    { name: 'ex2', targets: ['javascript'] },
                    { name: 'ex4', targets: ['assemblyscript'] },
                    { name: 'ex3', targets: ['assemblyscript'] },
                ],
                dependencies: [codeGenerator3, codeDefinition1],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                codeGenerator1,
                codeDefinition2,
            ]

            assert.deepStrictEqual(
                collectExports('assemblyscript', dependencies),
                [
                    { name: 'ex1' },
                    { name: 'ex4', targets: ['assemblyscript'] },
                    { name: 'ex3', targets: ['assemblyscript'] },
                ]
            )
        })
    })

    describe('collectImports', () => {
        it('should collect imports recursively and remove duplicates', () => {
            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                imports: [
                    { name: 'ex1', args: [], returns: 'void' },
                    { name: 'ex3', args: [], returns: 'void' },
                ],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                // no imports here shouldnt break the chain
                dependencies: [() => ``, codeDefinition1],
            }
            const codeDefinition3: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                imports: [{ name: 'ex4', args: [], returns: 'void' }],
                dependencies: [codeDefinition2],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                () => ``,
                codeDefinition3,
            ]

            assert.deepStrictEqual(collectImports(dependencies), [
                { name: 'ex1', args: [], returns: 'void' },
                { name: 'ex3', args: [], returns: 'void' },
                { name: 'ex4', args: [], returns: 'void' },
            ])
        })
    })
})
