/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { CompilerSettings, NodeImplementations } from './types'

export class Compilation {
    readonly graph: PdDspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly settings: CompilerSettings

    constructor(
        graph: PdDspGraph.Graph,
        nodeImplementations: NodeImplementations,
        settings: CompilerSettings
    ) {
        this.graph = graph
        this.nodeImplementations = nodeImplementations
        this.settings = settings
    }

    getNodeImplementation = (nodeType: PdSharedTypes.NodeType) => {
        const nodeImplementation = this.nodeImplementations[nodeType]
        if (!nodeImplementation) {
            throw new Error(`node ${nodeType} is not implemented`)
        }
        return nodeImplementation
    }
}
