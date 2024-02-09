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
import { NodeImplementation, GlobalCodeGeneratorWithSettings } from '../types'
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
    readonly input: Readonly<PrecompilationInput>
    readonly output: Readonly<PrecompiledCode>
}

export interface PrecompilationInput {
    readonly graph: Readonly<DspGraph.Graph>
    readonly nodeImplementations: Readonly<NodeImplementations>
    readonly settings: Readonly<CompilationSettings>
}

export type PrecompiledCode = {
    readonly variableNamesIndex: VariableNamesIndex
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
        imports: NonNullable<GlobalCodeGeneratorWithSettings['imports']>
        exports: NonNullable<GlobalCodeGeneratorWithSettings['exports']>
        ast: AstSequence
    }
    readonly graph: {
        fullTraversal: DspGraph.GraphTraversal
        hotDspGroup: DspGroup
        coldDspGroups: { [groupId: string]: ColdDspGroup }
    }
}

export interface PrecompiledNodeCode {
    readonly nodeType: DspGraph.NodeType
    state: null | {
        readonly name: VariableName
        readonly initialization: { [key: string]: NonNullable<AstVarBase['value']> }
    }
    readonly messageReceivers: { [inletId: DspGraph.PortletId]: AstFunc }
    readonly messageSenders: {
        [outletId: DspGraph.PortletId]: {
            messageSenderName: VariableName
            sinkFunctionNames: Array<VariableName>
        }
    }
    readonly signalOuts: { [outletId: DspGraph.PortletId]: VariableName }
    readonly signalIns: { [portletId: DspGraph.PortletId]: Code }
    initialization: AstElement
    readonly dsp: {
        loop: AstElement,
        inlets: { [inletId: DspGraph.PortletId]: AstElement }
    }
}

export interface DspGroup {
    traversal: DspGraph.GraphTraversal
    outNodesIds: Array<DspGraph.NodeId>
}

export interface ColdDspGroup extends DspGroup {
    sinkConnections: Array<DspGraph.Connection>
}

export interface NodeVariableNames {
    readonly signalOuts: { [portletId: DspGraph.PortletId]: VariableName }
    readonly messageSenders: { [portletId: DspGraph.PortletId]: VariableName }
    readonly messageReceivers: { [portletId: DspGraph.PortletId]: VariableName }
    state: VariableName | null
}

/**
 * Map of all global variable names used for compilation.
 *
 * @todo : for the sake of completeness, this should include also all global variables dependencies, etc ...
 */
export interface VariableNamesIndex {
    /** Namespace for individual nodes */
    readonly nodes: { [nodeId: DspGraph.NodeId]: NodeVariableNames }

    readonly nodeImplementations: {
        [nodeType: DspGraph.NodeType]: {
            stateClass: VariableName | null
        }
    }

    /** Namespace for global variables */
    readonly globs: {
        /** Frame count, reinitialized at each dsp loop start */
        iterFrame: string
        /** Frame count, never reinitialized */
        frame: string
        blockSize: string
        sampleRate: string
        output: string
        input: string
        nullMessageReceiver: string
        nullSignal: string
        emptyMessage: string
    }

    readonly io: {
        readonly messageReceivers: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: {
                    nodeId: DspGraph.NodeId
                    funcName: VariableName
                }
            }
        }
        readonly messageSenders: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: {
                    nodeId: DspGraph.NodeId
                    funcName: VariableName
                }
            }
        }
    }

    readonly coldDspGroups: { [groupId: string]: VariableName }
}
