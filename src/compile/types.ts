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

import { AstClass, AstElement, AstFunc, AstSequence } from '../ast/types'
import { VariableName } from '../ast/types'
import { DspGraph } from '../dsp-graph'

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

export interface UserCompilationSettings {
    audio?: AudioSettings
    arrays?: DspGraph.Arrays
    io?: {
        messageReceivers?: IoMessageSpecs
        messageSenders?: IoMessageSpecs
    }
    debug?: boolean
}

export interface CompilationSettings {
    target: CompilerTarget
    audio: AudioSettings
    arrays: DspGraph.Arrays
    io: {
        messageReceivers: IoMessageSpecs
        messageSenders: IoMessageSpecs
    }
    debug: boolean
}

/** Generator for global code that specifies also extra settings */
export type GlobalsDefinitions = {
    code: (
        ns: AssignerNamespace,
        context: GlobalCodePrecompilationContext
    ) => AstElement
    namespace: string
    exports?: (
        ns: AssignerNamespace,
        context: GlobalCodePrecompilationContext
    ) => Array<VariableName>
    imports?: (
        ns: AssignerNamespace,
        context: GlobalCodePrecompilationContext
    ) => Array<AstFunc>
    dependencies?: Array<GlobalsDefinitions>
}

/** Implementation of a graph node type */
export interface NodeImplementation<NodeArgsType = {}> {
    flags?: {
        /**
         * true if the node's signal outputs strictly depend
         * on its signal inputs and its state.
         *
         * e.g. : [osc~] is not pure since its outputs change at each
         * time step of the dsp.
         */
        isPureFunction?: true

        isDspInline?: true

        alphaName?: string
    }

    state?: (context: {
        globals: GlobalCodePrecompilationContext['globals']
        ns: AssignerNamespace
        node: DspGraph.Node<NodeArgsType>
        settings: CompilationSettings
    }) => AstClass

    core?: (context: {
        globals: GlobalCodePrecompilationContext['globals']
        ns: AssignerNamespace
        settings: CompilationSettings
    }) => AstElement

    initialization?: (context: {
        globals: GlobalCodePrecompilationContext['globals']
        ns: AssignerNamespace
        state: NodePrecompilationContext['state']
        snds: NodePrecompilationContext['snds']
        node: DspGraph.Node<NodeArgsType>
        settings: CompilationSettings
    }) => AstSequence

    /**
     * Generates the code that will be ran each iteration of the dsp loop for that node instance.
     * Typically reads from ins, runs some calculations, and write results to outs.
     *
     * Can also define dsp per inlet, in which case that dsp will be ran only when the inlet value changes.
     * This allows to optimize the dsp loop by only running the code that is necessary.
     */
    dsp?: (context: {
        globals: GlobalCodePrecompilationContext['globals']
        ns: AssignerNamespace
        state: NodePrecompilationContext['state']
        ins: NodePrecompilationContext['ins']
        outs: NodePrecompilationContext['outs']
        snds: NodePrecompilationContext['snds']
        node: DspGraph.Node<NodeArgsType>
        settings: CompilationSettings
    }) =>
        | AstSequence
        | {
              loop: AstSequence
              inlets: { [inletId: DspGraph.PortletId]: AstElement }
          }

    /**
     * Generate code for message receivers for a given node instance.
     */
    messageReceivers?: (context: {
        globals: GlobalCodePrecompilationContext['globals']
        ns: AssignerNamespace
        state: NodePrecompilationContext['state']
        snds: NodePrecompilationContext['snds']
        node: DspGraph.Node<NodeArgsType>
        settings: CompilationSettings
    }) => {
        [inletId: DspGraph.PortletId]: AstFunc
    }

    /** List of dependencies for this node type */
    dependencies?: Array<GlobalsDefinitions>
}

interface NodePrecompilationContext {
    state: VariableName
    ins: { [portletId: DspGraph.PortletId]: VariableName }
    outs: { [portletId: DspGraph.PortletId]: VariableName }
    snds: { [portletId: DspGraph.PortletId]: VariableName }
}

export interface GlobalCodePrecompilationContext {
    globals: { [nsName: string]: { [name: string]: VariableName } }
    settings: CompilationSettings
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any>
}

/**
 * Namespace handled by a proxy that auto assigns a variable name
 * when the key is accessed.
 */
type AssignerNamespace = { [name: string]: VariableName }
