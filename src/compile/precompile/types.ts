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
import { NodeImplementation, GlobalDefinitions, VariableNamesIndex } from '../types'
import {
    AstClass,
    AstElement,
    AstSequence,
    Code,
    VariableName,
    AstVarBase,
    AstFunc,
} from '../../ast/types'
import { DspGraph } from '../../dsp-graph'
import { NodeImplementations, CompilationSettings } from '../types'

export interface Precompilation {
    graph: Readonly<DspGraph.Graph>
    nodeImplementations: Readonly<NodeImplementations>
    readonly settings: Readonly<CompilationSettings>
    readonly precompiledCode: PrecompiledCode
    readonly precompiledCodeAssigner: PrecompiledCode
    readonly variableNamesIndex: VariableNamesIndex
    readonly variableNamesAssigner: VariableNamesIndex
    readonly variableNamesReadOnly: VariableNamesIndex
}

export interface PrecompilationInput {
    readonly graph: Readonly<DspGraph.Graph>
    readonly nodeImplementations: Readonly<NodeImplementations>
    readonly settings: Readonly<CompilationSettings>
}

export interface PrecompiledCode {
    readonly nodeImplementations: {
        [nodeType: DspGraph.NodeType]: {
            nodeImplementation: NodeImplementation
            stateClass: AstClass | null
            core: AstElement | null
        }
    }

    readonly nodes: {
        [nodeId: DspGraph.NodeId]: PrecompiledNodeCode
    }

    readonly dependencies: {
        imports: ReturnType<NonNullable<GlobalDefinitions['imports']>>
        exports: ReturnType<NonNullable<GlobalDefinitions['exports']>>
        ast: AstSequence
    }

    readonly graph: {
        fullTraversal: DspGraph.GraphTraversal
        hotDspGroup: DspGroup
        coldDspGroups: {
            [groupId: string]: ColdDspGroup
        }
    }

    readonly io: {
        messageReceivers: {
            [nodeId: DspGraph.NodeId]: {
                [inletId: DspGraph.PortletId]: {
                    functionName: VariableName
                    // Function because relies on other
                    // precompiled code values.
                    getSinkFunctionName: () => VariableName
                }
            }
        }
        messageSenders: {
            [nodeId: DspGraph.NodeId]: {
                [inletId: DspGraph.PortletId]: {
                    functionName: VariableName
                }
            }
        }
    }
}

export interface PrecompiledNodeCode {
    readonly nodeType: DspGraph.NodeType

    state: {
        readonly name: VariableName
        readonly initialization: {
            [key: string]: NonNullable<AstVarBase['value']>
        }
    } | null

    initialization: AstElement | null

    readonly messageReceivers: { [inletId: DspGraph.PortletId]: AstFunc }

    readonly messageSenders: {
        [outletId: DspGraph.PortletId]: {
            messageSenderName: VariableName
            sinkFunctionNames: Array<VariableName>
        }
    }

    readonly signalOuts: { [outletId: DspGraph.PortletId]: VariableName }

    readonly signalIns: { [portletId: DspGraph.PortletId]: Code }

    readonly dsp: {
        loop: AstElement
        inlets: { [inletId: DspGraph.PortletId]: AstElement }
    }
}

export interface ColdDspGroup {
    dspGroup: DspGroup
    sinkConnections: Array<DspGraph.Connection>
    functionName: VariableName
}

export interface DspGroup {
    traversal: DspGraph.GraphTraversal
    outNodesIds: Array<DspGraph.NodeId>
}