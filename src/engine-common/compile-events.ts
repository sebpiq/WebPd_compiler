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

import { DspGraph } from '@webpd/dsp-graph'
import { getNodeImplementation, renderCode } from '../compile-helpers'
import { Code, Compilation, NodeImplementation } from '../types'

export const compileEventConfigure = (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const { globs } = compilation.codeVariableNames

    return renderCode`
        ${globs.iterFrame} = 0
        ${globs.iterOutlet} = 0
        ${globs.frame} = 0
        ${graphTraversal.map((node) =>
            getEventCode(compilation, node, 'configure')
        )}
    `
}

export const compileEventArraysChanged = (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => renderCode`
        ${graphTraversal.map((node) =>
            getEventCode(compilation, node, 'arraysChanged')
        )}
    `

export const getEventCode = (
    compilation: Compilation,
    node: DspGraph.Node,
    eventName: keyof ReturnType<NodeImplementation<any>['events']>
): string => {
    const nodeImplementation = getNodeImplementation(
        compilation.nodeImplementations,
        node.type
    )
    const { macros } = compilation
    const { globs, types } = compilation.codeVariableNames
    return nodeImplementation.events
        ? nodeImplementation.events(
              node,
              {
                  ...compilation.codeVariableNames.nodes[node.id],
                  globs,
                  macros,
                  types,
              },
              compilation
          )[eventName] || ''
        : ''
}
