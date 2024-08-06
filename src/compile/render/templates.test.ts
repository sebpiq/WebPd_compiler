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
import { makeGraph } from '../../dsp-graph/test-helpers'
import {
    AnonFunc,
    Class,
    ConstVar,
    Func,
    Sequence,
    Var,
    ast,
} from '../../ast/declare'
import {
    assertAstSequencesAreEqual,
    normalizeAstSequence,
    precompilationToRenderTemplateInput,
    makeSettings,
    makePrecompilation,
} from '../test-helpers'
import templates from './templates'
import { AstSequence } from '../../ast/types'
import { VariableNamesIndex } from '../precompile/types'
import { CommonsNamespaceAll } from '../../stdlib/commons/types'

describe('templates', () => {
    describe('templates.portletsDeclarations', () => {
        it('should compile declarations for signal outlets', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })
            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.display

            precompilation.precompiledCodeAssigner.graph.fullTraversal = [
                'n1',
                'n2',
            ]
            precompilation.precompiledCodeAssigner.nodes.n1!.signalOuts['0'] =
                'N_n1_outs_0'
            precompilation.precompiledCodeAssigner.nodes.n1!.signalOuts['1'] =
                'N_n1_outs_1'
            precompilation.precompiledCodeAssigner.nodes.n2!.signalOuts['0'] =
                'N_n2_outs_0'

            const sequence = templates.portletsDeclarations(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    Var('Float', 'N_n1_outs_0', '0'),
                    Var('Float', 'N_n1_outs_1', '0'),
                    Var('Float', 'N_n2_outs_0', '0'),
                ])
            )
        })

        it('should compile node message receivers', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
                n2: {
                    isPushingMessages: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.display
            globals.msg.Message

            precompilation.precompiledCodeAssigner.graph.fullTraversal = [
                'n1',
                'n2',
            ]
            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '0'
            ] = Func('N_n1_rcvs_0', [
                Var(globals.msg.Message, 'm'),
            ])`// [n1] message receiver 0`
            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '1'
            ] = Func('N_n1_rcvs_1', [
                Var(globals.msg.Message, 'm'),
            ])`// [n1] message receiver 1`
            precompilation.precompiledCodeAssigner.nodes.n2!.messageReceivers[
                '0'
            ] = Func('N_n2_rcvs_0', [
                Var(globals.msg.Message, 'm'),
            ])`// [n2] message receiver 0`

            const sequence = templates.portletsDeclarations(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    Func('N_n1_rcvs_0', [
                        Var(globals.msg.Message, 'm'),
                    ])`// [n1] message receiver 0\nthrow new Error('Node "n1", inlet "0", unsupported message : ' + ${globals.msg.display!}(m))`,
                    Func('N_n1_rcvs_1', [
                        Var(globals.msg.Message, 'm'),
                    ])`// [n1] message receiver 1\nthrow new Error('Node "n1", inlet "1", unsupported message : ' + ${globals.msg.display!}(m))`,
                    Func('N_n2_rcvs_0', [
                        Var(globals.msg.Message, 'm'),
                    ])`// [n2] message receiver 0\nthrow new Error('Node "n2", inlet "0", unsupported message : ' + ${globals.msg.display!}(m))`,
                ])
            )
        })

        it('should render correct error throw if debug = true', () => {
            const settings = makeSettings({ debug: true })

            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
                settings,
            })
            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.display!
            globals.msg.Message

            precompilation.precompiledCodeAssigner.graph.fullTraversal = ['n1']
            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '0'
            ] = Func('N_n1_rcvs_0', [
                Var(globals.msg.Message, 'm'),
            ])`// [n1] message receiver 0`

            const sequence = templates.portletsDeclarations(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    Func('N_n1_rcvs_0', [
                        Var(globals.msg.Message, 'm'),
                    ])`// [n1] message receiver 0\nthrow new Error('Node "n1", inlet "0", unsupported message : ' + ${globals.msg.display!}(m) + '\\nDEBUG : remember, you must return from message receiver')`,
                ])
            )
        })

        it('should compile node message senders', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
                n2: {
                    isPushingMessages: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.Message

            precompilation.precompiledCodeAssigner.graph.fullTraversal = [
                'n1',
                'n2',
            ]
            precompilation.precompiledCodeAssigner.nodes.n1!.messageSenders[
                '0'
            ] = {
                messageSenderName: 'N_n1_snds_0',
                sinkFunctionNames: ['N_n2_rcvs_0', 'N_n2_rcvs_1', 'DSP_1'],
            }
            precompilation.precompiledCodeAssigner.nodes.n1!.messageSenders[
                '1'
            ] = {
                messageSenderName: 'N_n1_snds_1',
                sinkFunctionNames: ['outlerListener_n1_0', 'N_n2_rcvs_0'],
            }
            // Will not be rendered because no sinks
            precompilation.precompiledCodeAssigner.nodes.n2!.messageSenders[
                '0'
            ] = {
                messageSenderName: 'N_n3_rcvs_0',
                sinkFunctionNames: [],
            }

            const sequence = templates.portletsDeclarations(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    Func('N_n1_snds_0', [
                        Var(globals.msg.Message, 'm'),
                    ])`N_n2_rcvs_0(m)\nN_n2_rcvs_1(m)\nDSP_1(m)`,
                    Func('N_n1_snds_1', [
                        Var(globals.msg.Message, 'm'),
                    ])`outlerListener_n1_0(m)\nN_n2_rcvs_0(m)`,
                ])
            )
        })
    })

    describe('templates.nodeStateInstances', () => {
        it('should compile declarations for node state and filter out nodes with no state declaration', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
                },
                n2: {
                    type: 'type1',
                    isPushingMessages: true,
                },
                n3: {
                    type: 'type1',
                    isPushingMessages: true,
                },
            })

            const nodeImplementations = {
                type1: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCodeAssigner.graph.fullTraversal = [
                'n1',
                'n2',
                'n3',
            ]

            precompilation.precompiledCodeAssigner.nodeImplementations.type1!.stateClass =
                Class('State', [Var('Float', 'a'), Var('Float', 'b')])
            precompilation.precompiledCodeAssigner.nodes.n1!.state = {
                name: 'n1_STATE',
                initialization: {
                    a: Sequence(['111']),
                    b: Sequence([AnonFunc([Var('Float', 'x')])`return x * 2`]),
                },
            }
            precompilation.precompiledCodeAssigner.nodes.n2!.state = {
                name: 'n2_STATE',
                initialization: {
                    a: Sequence(['333']),
                    b: Sequence(['444']),
                },
            }
            precompilation.precompiledCodeAssigner.nodes.n3!.state = null

            const sequence = templates.nodeStateInstances(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    ConstVar(
                        'State',
                        'n1_STATE',
                        ast`{\na: 111,\nb: ${AnonFunc([
                            Var('Float', 'x'),
                        ])`return x * 2`},\n}`
                    ),
                    ConstVar('State', 'n2_STATE', ast`{\na: 333,\nb: 444,\n}`),
                ])
            )
        })
    })

    describe('templates.nodeImplementationsCoreAndStateClasses', () => {
        it('should generate initializations for nodes', () => {
            const nodeImplementations = {
                type1: {},
                type2: {},
            }
            const precompilation = makePrecompilation({ nodeImplementations })

            precompilation.precompiledCodeAssigner.nodeImplementations.type1!.stateClass =
                Class('State_type1', [Var('Float', 'a')])
            precompilation.precompiledCodeAssigner.nodeImplementations.type1!.core =
                Sequence([
                    ConstVar('Bla', 'bla', '"hello"'),
                    Func('blo', [Var('State_type1', 'state')])`// blo`,
                ])
            precompilation.precompiledCodeAssigner.nodeImplementations.type1!.nodeImplementation =
                {}

            precompilation.precompiledCodeAssigner.nodeImplementations.type2!.stateClass =
                Class('State_type2', [Var('Float', 'b')])
            precompilation.precompiledCodeAssigner.nodeImplementations.type2!.core =
                Sequence([ConstVar('Int', 'i', '0')])
            precompilation.precompiledCodeAssigner.nodeImplementations.type2!.nodeImplementation =
                {}

            const sequence = templates.nodeImplementationsCoreAndStateClasses(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    Class('State_type1', [Var('Float', 'a')]),
                    ConstVar('Bla', 'bla', '"hello"'),
                    Func('blo', [Var('State_type1', 'state')])`// blo`,
                    Class('State_type2', [Var('Float', 'b')]),
                    ConstVar('Int', 'i', '0'),
                ])
            )
        })
    })

    describe('templates.nodeInitializations', () => {
        it('should generate initializations for nodes', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
                n2: {
                    isPushingMessages: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.precompiledCodeAssigner.graph.fullTraversal = [
                'n1',
                'n2',
            ]
            precompilation.precompiledCodeAssigner.nodes.n1!.initialization = ast`
                ${Var('Float', 'n1', '0')}
                console.log(n1)
            `
            precompilation.precompiledCodeAssigner.nodes.n2!.initialization = ast``

            const sequence = templates.nodeInitializations(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([Var('Float', 'n1', '0'), 'console.log(n1)'])
            )
        })
    })

    describe('templates.ioMessageReceivers', () => {
        it('should compile declared io.messageReceivers', () => {
            const graph = makeGraph({
                n1: {},
            })

            const precompilation = makePrecompilation({
                graph,
            })

            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.Message

            precompilation.precompiledCodeAssigner.io.messageReceivers.n1![
                '0'
            ] = {
                functionName: 'ioRcv_function',
                getSinkFunctionName: () => 'ioRcvNode_messageSender',
            }

            const sequence = templates.ioMessageReceivers(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                sequence,
                Sequence([
                    Func('ioRcv_function', [
                        Var(globals.msg.Message, 'm'),
                    ])`ioRcvNode_messageSender(m)`,
                ])
            )
        })
    })

    describe('templates.dspLoop', () => {
        const _ensureVariableNames = (globals: VariableNamesIndex['globals']) => {
            ;(globals.commons as CommonsNamespaceAll)._emitFrame
            globals.core.IT_FRAME
            globals.core.BLOCK_SIZE
            globals.core.FRAME
        }

        it('should compile the dsp loop function', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
                n3: {
                    isPullingSignal: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })
            const globals = precompilation.variableNamesAssigner.globals
            _ensureVariableNames(globals)

            precompilation.precompiledCodeAssigner.graph.hotDspGroup = {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            }
            precompilation.precompiledCodeAssigner.nodes.n1!.dsp.loop = ast`// n1`
            precompilation.precompiledCodeAssigner.nodes.n2!.dsp.loop = ast`// n2`
            precompilation.precompiledCodeAssigner.nodes.n3!.dsp.loop = ast`// n3`

            const sequence = templates.dspLoop(
                precompilationToRenderTemplateInput(precompilation)
            )

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                Sequence([
                    `for (IT_FRAME = 0; IT_FRAME < BLOCK_SIZE; IT_FRAME++) {\n${
                        (globals.commons as CommonsNamespaceAll)._emitFrame
                    }(FRAME)\n` +
                        '// n1\n' +
                        '// n2\n' +
                        '// n3\n' +
                        `FRAME++\n}`,
                ])
            )
        })

        it('should add to the dsp loop inlet dsp functions not connected to cold dsp', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })
            const globals = precompilation.variableNamesAssigner.globals
            _ensureVariableNames(globals)

            precompilation.precompiledCodeAssigner.nodes.n1!.dsp.inlets[
                '0'
            ] = ast`// inlet dsp 0`
            precompilation.precompiledCodeAssigner.nodes.n1!.dsp.loop = ast`// n1`
            precompilation.precompiledCodeAssigner.graph.hotDspGroup = {
                traversal: ['n1'],
                outNodesIds: ['n1'],
            }
            precompilation.precompiledCodeAssigner.graph.coldDspGroups = {}

            const sequence = templates.dspLoop(
                precompilationToRenderTemplateInput(precompilation)
            )

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                Sequence([
                    `for (IT_FRAME = 0; IT_FRAME < BLOCK_SIZE; IT_FRAME++) {\n${
                        (globals.commons as CommonsNamespaceAll)._emitFrame
                    }(FRAME)\n` +
                        '// inlet dsp 0\n' +
                        '// n1\n' +
                        'FRAME++\n}',
                ])
            )
        })
    })

    describe('templates.coldDspInitialization', () => {
        it('should compile cold dsp initialization', () => {
            const graph = makeGraph({})

            const precompilation = makePrecompilation({
                graph,
            })
            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.emptyMessage

            precompilation.precompiledCodeAssigner.graph.coldDspGroups = {
                '0': {
                    dspGroup: {
                        traversal: [],
                        outNodesIds: [],
                    },
                    sinkConnections: [],
                    functionName: 'COLD_0',
                },
                '1': {
                    dspGroup: {
                        traversal: [],
                        outNodesIds: [],
                    },
                    sinkConnections: [],
                    functionName: 'COLD_1',
                },
            }

            const sequence = templates.coldDspInitialization(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                normalizeAstSequence(sequence),
                Sequence([`COLD_0(G_msg_emptyMessage)\nCOLD_1(G_msg_emptyMessage)`])
            )
        })
    })

    describe('templates.coldDspFunctions', () => {
        it('should compile cold dsp functions', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
                n3: {
                    isPullingSignal: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.Message

            precompilation.precompiledCodeAssigner.nodes.n1!.dsp.loop = ast`// n1`
            precompilation.precompiledCodeAssigner.nodes.n2!.dsp.loop = ast`// n2`
            precompilation.precompiledCodeAssigner.nodes.n3!.dsp.loop = ast`// n3`

            precompilation.precompiledCodeAssigner.graph.coldDspGroups = {
                '0': {
                    dspGroup: {
                        traversal: ['n1', 'n2'],
                        outNodesIds: ['n2'],
                    },
                    sinkConnections: [],
                    functionName: 'COLD_0',
                },
                '1': {
                    dspGroup: {
                        traversal: ['n3'],
                        outNodesIds: ['n3'],
                    },
                    sinkConnections: [],
                    functionName: 'COLD_1',
                },
            }

            const sequence = templates.coldDspFunctions(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                normalizeAstSequence(sequence),
                Sequence([
                    Func('COLD_0', [Var(globals.msg.Message, 'm')])`// n1\n// n2`,
                    Func('COLD_1', [Var(globals.msg.Message, 'm')])`// n3`,
                ])
            )
        })

        it('should add calls to inlet dsp functions which are connected to cold dsp groups', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.Message

            precompilation.precompiledCodeAssigner.nodes.n1!.dsp.loop = ast`// n1`
            precompilation.precompiledCodeAssigner.nodes.n2!.dsp.inlets[
                '0'
            ] = ast`// inlet dsp n2`
            precompilation.precompiledCodeAssigner.graph.coldDspGroups = {
                '0': {
                    dspGroup: {
                        traversal: ['n1'],
                        outNodesIds: ['n1'],
                    },
                    sinkConnections: [
                        [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n2', portletId: '0' },
                        ],
                    ],
                    functionName: 'COLD_0',
                },
            }

            const sequence = templates.coldDspFunctions(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                normalizeAstSequence(sequence),
                Sequence([
                    Func('COLD_0', [
                        Var(globals.msg.Message, 'm'),
                    ])`// n1\n// inlet dsp n2`,
                ])
            )
        })

        it('should not add calls to inlet dsp if not defined by the sink node', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            const globals = precompilation.variableNamesAssigner.globals
            // Make sure they are defined
            globals.msg.Message

            precompilation.precompiledCodeAssigner.nodes.n1!.dsp.loop = ast`// n1`
            // This call is just to setup n2 base structure
            precompilation.precompiledCodeAssigner.nodes.n2!
            precompilation.precompiledCodeAssigner.graph.coldDspGroups = {
                '0': {
                    dspGroup: {
                        traversal: ['n1'],
                        outNodesIds: ['n1'],
                    },
                    sinkConnections: [
                        [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n2', portletId: '0' },
                        ],
                    ],
                    functionName: 'COLD_0',
                },
            }

            const sequence = templates.coldDspFunctions(
                precompilationToRenderTemplateInput(precompilation)
            )

            assertAstSequencesAreEqual(
                normalizeAstSequence(sequence),
                Sequence([Func('COLD_0', [Var(globals.msg.Message, 'm')])`// n1`])
            )
        })
    })
})
