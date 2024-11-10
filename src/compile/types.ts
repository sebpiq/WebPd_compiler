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
import { FsNamespacePublic } from '../stdlib/fs/types'
import { BufNamespacePublic } from '../stdlib/buf/types'
import { CommonsNamespacePublic } from '../stdlib/commons/types'
import { CoreNamespacePublic } from '../stdlib/core/types'
import { MsgNamespacePublic } from '../stdlib/msg/types'
import { SkedNamespacePublic } from '../stdlib/sked/types'

export type CustomMetadataValue =
    | boolean
    | string
    | number
    | Array<CustomMetadataValue>
    | CustomMetadata

export type CustomMetadata = {
    [key: string]: CustomMetadataValue
}

export type IoMessageSpecs = {
    [nodeId: DspGraph.NodeId]: Array<DspGraph.PortletId>
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
    customMetadata?: CustomMetadata
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
    customMetadata: CustomMetadata
}

interface GlobalDefinitionsLocalContext<Keys extends string> {
    readonly ns: { [name in Keys]: VariableName }
}

/** Generator for global code that specifies also extra settings */
export type GlobalDefinitions<
    AllKeys extends string = string,
    ExportsKeys extends string = string
> = {
    code: (
        localContext: GlobalDefinitionsLocalContext<AllKeys>,
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => AstElement
    namespace: string
    exports?: (
        localContext: GlobalDefinitionsLocalContext<ExportsKeys>,
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => Array<VariableName>
    imports?: (
        localContext: GlobalDefinitionsLocalContext<AllKeys>,
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => Array<AstFunc>
    dependencies?: Array<GlobalDefinitions>
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

    state?: (
        localContext: {
            ns: ReadOnlyNamespace
            node: DspGraph.Node<NodeArgsType>
        },
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => AstClass

    core?: (
        localContext: {
            ns: AssignerNamespace
        },
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => AstElement

    initialization?: (
        localContext: {
            ns: ReadOnlyNamespace
            state: VariableName
            snds: ReadOnlyNamespace
            node: DspGraph.Node<NodeArgsType>
        },
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => AstSequence

    /**
     * Generates the code that will be ran each iteration of the dsp loop for that node instance.
     * Typically reads from ins, runs some calculations, and write results to outs.
     *
     * Can also define dsp per inlet, in which case that dsp will be ran only when the inlet value changes.
     * This allows to optimize the dsp loop by only running the code that is necessary.
     */
    dsp?: (
        localContext: {
            ns: ReadOnlyNamespace
            state: VariableName
            ins: ReadOnlyNamespace
            outs: ReadOnlyNamespace
            snds: ReadOnlyNamespace
            node: DspGraph.Node<NodeArgsType>
        },
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) =>
        | AstSequence
        | {
              loop: AstSequence
              inlets: { [inletId: DspGraph.PortletId]: AstElement }
          }

    /**
     * Generate code for message receivers for a given node instance.
     */
    messageReceivers?: (
        localContext: {
            ns: ReadOnlyNamespace
            state: VariableName
            snds: ReadOnlyNamespace
            node: DspGraph.Node<NodeArgsType>
        },
        globals: VariableNamesIndex['globals'],
        settings: CompilationSettings
    ) => {
        [inletId: DspGraph.PortletId]: AstFunc
    }

    /** List of dependencies for this node type */
    dependencies?: Array<GlobalDefinitions>
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any>
}

/**
 * Map of all variable names used for compilation. This map allows to :
 *  - ensure name unicity through the use of namespaces
 *  - give all variable names a stable path
 *
 * For example we might have :
 *
 * ```
 * const variableNamesIndex = {
 *     globals: {
 *         // ...
 *         fs: {
 *             // ...
 *             counter: 'g_fs_counter_auto_generated_12345'
 *         },
 *         buf: {
 *             // ...
 *             counter: 'g_buf_counter'
 *         }
 *     }
 * }
 * ```
 *
 * Both `counter` variables are namespaced respectively under `fs` and `buf`,
 * therefore ensuring their unicity, also the map allow to store the automatically
 * generated names, making it possible to avoid direct manipulation.
 */
export interface VariableNamesIndex {
    /** Namespace for individual nodes */
    readonly nodes: { [nodeId: DspGraph.NodeId]: NodeVariableNames }

    readonly nodeImplementations: {
        [nodeType: DspGraph.NodeType]: Namespace
    }

    readonly globals: {
        fs?: Record<keyof FsNamespacePublic, VariableName>
        buf?: Record<keyof BufNamespacePublic, VariableName>
        commons: Record<keyof CommonsNamespacePublic, VariableName>
        core: Record<keyof CoreNamespacePublic, VariableName>
        msg: Record<keyof MsgNamespacePublic, VariableName>
        sked: Record<keyof SkedNamespacePublic, VariableName>
        [ns: DspGraph.NodeType]: Namespace | undefined
    }

    readonly io: {
        readonly messageReceivers: {
            [nodeId: DspGraph.NodeId]: {
                [inletId: DspGraph.PortletId]: VariableName
            }
        }
        readonly messageSenders: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: VariableName
            }
        }
    }

    readonly coldDspGroups: { [groupId: string]: VariableName }
}

export interface NodeVariableNames {
    readonly signalOuts: { [outletId: DspGraph.PortletId]: VariableName }
    readonly messageSenders: { [outletId: DspGraph.PortletId]: VariableName }
    readonly messageReceivers: { [inletId: DspGraph.PortletId]: VariableName }
    state: VariableName | null
}

export type Namespace = { [name: string]: VariableName }

/**
 * Namespace handled by a proxy that only allows reading, and throws
 * an error for unknown keys.
 */
type ReadOnlyNamespace = { readonly [name: string]: VariableName }

/**
 * Namespace handled by a proxy that auto assigns a variable name
 * when the key is accessed.
 */
type AssignerNamespace = Namespace
