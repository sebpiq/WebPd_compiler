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

import { AstElement, AstFunc, AstSequence, AstVar } from '../ast/types'
import { VariableName, Code } from '../ast/types'
import { DspGraph } from '../dsp-graph'

// -------------------------------- COMPILATION -------------------------------- //
type PortletsSpecMetadataBasicValue = boolean | string | number

export type IoMessageSpecs = {
    [nodeId: DspGraph.NodeId]: {
        portletIds: Array<DspGraph.PortletId>
        metadata?: {
            [key: string]:
                | PortletsSpecMetadataBasicValue
                | Array<PortletsSpecMetadataBasicValue>
                | { [key: string]: PortletsSpecMetadataBasicValue }
        }
    }
}

export type CompilerTarget = 'assemblyscript' | 'javascript'

export interface AudioSettings {
    channelCount: {
        in: number
        out: number
    }
    bitDepth: 32 | 64
}

export interface CompilationSettings {
    audio?: AudioSettings
    arrays?: DspGraph.Arrays
    io?: {
        messageReceivers?: IoMessageSpecs
        messageSenders?: IoMessageSpecs
    }
    debug?: boolean
}

export interface Compilation {
    readonly settings: {
        audio: AudioSettings
        arrays: DspGraph.Arrays
        io: {
            messageReceivers: IoMessageSpecs
            messageSenders: IoMessageSpecs
        }
        debug: boolean
    }
    readonly target: CompilerTarget
    readonly graph: DspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly variableNamesIndex: VariableNamesIndex
    readonly precompilation: Precompilation
}

/**
 * Precompilation for a graph, allowing mostly to implement various optimizations.
 * This map is then used in code generation to replace variables with their precompiled counterparts.
 */
export type Precompilation = {
    nodes: {
        [nodeId: DspGraph.NodeId]: PrecompiledNodeCode
    }
    dependencies: {
        imports: NonNullable<GlobalCodeGeneratorWithSettings['imports']>
        exports: NonNullable<GlobalCodeGeneratorWithSettings['exports']>
        ast: AstSequence
    }
    graph: {
        fullTraversal: DspGraph.GraphTraversal
        hotDspGroup: DspGroup
        coldDspGroups: { [groupId: string]: ColdDspGroup }
    }
}

export interface PrecompiledNodeCode {
    nodeImplementation: NodeImplementation<any>
    generationContext: {
        signalOuts: { [portletId: DspGraph.PortletId]: Code }
        messageSenders: { [portletId: DspGraph.PortletId]: Code }
        messageReceivers: { [portletId: DspGraph.PortletId]: Code }
        signalIns: { [portletId: DspGraph.PortletId]: Code }
        state: VariableName
    }
    messageReceivers: { [inletId: DspGraph.PortletId]: AstFunc }
    messageSenders: {
        [outletId: DspGraph.PortletId]: {
            messageSenderName: VariableName
            functionNames: Array<VariableName>
        }
    }
    signalOuts: { [outletId: DspGraph.PortletId]: VariableName }
    stateInitialization: AstVar | null
    initialization: AstElement
    loop: AstElement
    caching: { [inletId: DspGraph.PortletId]: AstElement }
}

export interface DspGroup {
    traversal: DspGraph.GraphTraversal
    outNodesIds: Array<DspGraph.NodeId>
}

export interface ColdDspGroup extends DspGroup {
    sinkConnections: Array<DspGraph.Connection>
}

// -------------------------------- CODE GENERATION -------------------------------- //
export interface NodeVariableNames {
    signalOuts: { [portletId: DspGraph.PortletId]: VariableName }
    messageSenders: { [portletId: DspGraph.PortletId]: VariableName }
    messageReceivers: { [portletId: DspGraph.PortletId]: VariableName }
    state: VariableName
}

/**
 * Map of all global variable names used for compilation.
 *
 * @todo : for the sake of completeness, this should include also all global variables dependencies, etc ...
 */
export interface VariableNamesIndex {
    /** Namespace for individual nodes */
    nodes: { [nodeId: DspGraph.NodeId]: NodeVariableNames }

    /** Namespace for global variables */
    globs: {
        /** Frame count, reinitialized at each loop start */
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

    io: {
        messageReceivers: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: VariableName
            }
        }
        messageSenders: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: VariableName
            }
        }
    }

    coldDspGroups: { [groupId: string]: VariableName }
}

export interface GlobalCodeGeneratorContext {
    target: CompilerTarget
    audioSettings: AudioSettings
    globs: VariableNamesIndex['globs']
}

/** Simplest form of generator for global code */
export type GlobalCodeGenerator = (
    context: GlobalCodeGeneratorContext
) => AstElement

export interface GlobalCodeDefinitionExport {
    name: VariableName
    targets?: Array<CompilerTarget>
}

/** Generator for global code that specifies also extra settings */
export interface GlobalCodeGeneratorWithSettings {
    codeGenerator: GlobalCodeGenerator
    exports?: Array<GlobalCodeDefinitionExport>
    imports?: Array<AstFunc>
    dependencies?: Array<GlobalCodeDefinition>
}

export type GlobalCodeDefinition =
    | GlobalCodeGenerator
    | GlobalCodeGeneratorWithSettings

/** Implementation of a graph node type */
export interface NodeImplementation<NodeArgsType> {
    flags?: {
        /**
         * true if the node's signal outputs strictly depend
         * on its signal inputs and its state.
         *
         * e.g. : [osc~] is not pure since its outputs change at each
         * time step of the dsp.
         */
        isPureFunction?: true
    }

    stateInitialization?: (context: {
        globs: VariableNamesIndex['globs']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => AstVar

    initialization?: (context: {
        globs: VariableNamesIndex['globs']
        state: PrecompiledNodeCode['generationContext']['state']
        snds: PrecompiledNodeCode['generationContext']['messageSenders']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => AstSequence

    /**
     * Generates the code that will be ran each iteration of the loop for that node instance.
     * Typically reads from ins, runs some calculations, and write results to outs.
     *
     * @see generateInlineLoop for more complexe loop code generation.
     */
    loop?: (context: {
        globs: VariableNamesIndex['globs']
        state: PrecompiledNodeCode['generationContext']['state']
        ins: PrecompiledNodeCode['generationContext']['signalIns']
        outs: PrecompiledNodeCode['generationContext']['signalOuts']
        snds: PrecompiledNodeCode['generationContext']['messageSenders']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => AstSequence

    /**
     * Generates the code that will be ran each iteration of the loop for that node instance.
     * This should only generate an expression without side effects : no variable declaration,
     * no variable assignment, ... Therefore, this can only be used if the node has a unique
     * signal outlet.
     *
     * @see loop for more complexe loop code generation.
     */
    inlineLoop?: (context: {
        globs: VariableNamesIndex['globs']
        state: PrecompiledNodeCode['generationContext']['state']
        ins: PrecompiledNodeCode['generationContext']['signalIns']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => AstSequence

    /**
     * Generate code for message receivers for a given node instance.
     */
    messageReceivers?: (context: {
        globs: VariableNamesIndex['globs']
        state: PrecompiledNodeCode['generationContext']['state']
        snds: PrecompiledNodeCode['generationContext']['messageSenders']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => {
        [inletId: DspGraph.PortletId]: AstFunc
    }

    caching?: (context: {
        globs: VariableNamesIndex['globs']
        state: PrecompiledNodeCode['generationContext']['state']
        ins: PrecompiledNodeCode['generationContext']['signalIns']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => {
        [inletId: DspGraph.PortletId]: AstElement
    }

    /** List of dependencies for this node type */
    dependencies?: Array<GlobalCodeDefinition>
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any>
}
