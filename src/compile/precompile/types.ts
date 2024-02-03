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

export interface PrecompilationOperation {
    readonly input: PrecompilationInput
    readonly output: PrecompiledCode
}

export interface PrecompilationInput {
    readonly graph: DspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly settings: CompilationSettings
}

export type PrecompiledCode = {
    variableNamesIndex: VariableNamesIndex
    nodes: {
        [nodeId: DspGraph.NodeId]: PrecompiledNodeCode
    }
    nodeImplementations: {
        [nodeType: DspGraph.NodeType]: {
            nodeImplementation: NodeImplementation
            stateClass: AstClass | null
            core: AstElement | null
        }
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
    nodeImplementation: NodeImplementation
    generationContext: {
        signalOuts: { [portletId: DspGraph.PortletId]: Code }
        messageSenders: { [portletId: DspGraph.PortletId]: Code }
        messageReceivers: { [portletId: DspGraph.PortletId]: Code }
        signalIns: { [portletId: DspGraph.PortletId]: Code }
        state: VariableName
    }
    state: null | {
        className: VariableName
        initialization: { [key: string]: NonNullable<AstVarBase['value']> }
    }
    messageReceivers: { [inletId: DspGraph.PortletId]: AstFunc }
    messageSenders: {
        [outletId: DspGraph.PortletId]: {
            messageSenderName: VariableName
            functionNames: Array<VariableName>
        }
    }
    signalOuts: { [outletId: DspGraph.PortletId]: VariableName }
    initialization: AstElement
    dsp: {
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
    signalOuts: { [portletId: DspGraph.PortletId]: VariableName }
    messageSenders: { [portletId: DspGraph.PortletId]: VariableName }
    messageReceivers: { [portletId: DspGraph.PortletId]: VariableName }
    state: VariableName
}

interface NodeImplementationVariableNames {
    stateClass?: VariableName
}

/**
 * Map of all global variable names used for compilation.
 *
 * @todo : for the sake of completeness, this should include also all global variables dependencies, etc ...
 */
export interface VariableNamesIndex {
    /** Namespace for individual nodes */
    nodes: { [nodeId: DspGraph.NodeId]: NodeVariableNames }

    nodeImplementations: {
        [nodeType: DspGraph.NodeType]: NodeImplementationVariableNames
    }

    /** Namespace for global variables */
    globs: {
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
