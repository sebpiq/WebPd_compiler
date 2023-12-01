import {
    Compilation,
    GlobalCodeDefinitionExport,
} from './types'
import { AstFunc, AstSequence, VariableName } from '../ast/types'
import { Sequence, Func, Var, ast } from '../ast/declare'
import { DspGraph, traversal } from '../dsp-graph'

export const generateGlobs = ({
    variableNamesIndex: { globs },
}: Compilation): AstSequence =>
    // prettier-ignore
    Sequence([
        Var('Int', globs.iterFrame, '0'),
        Var('Int', globs.frame, '0'),
        Var('Int', globs.blockSize, '0'),
        Var('Float', globs.sampleRate, '0'),
        Var('Float', globs.nullSignal, '0'),
        Func(globs.nullMessageReceiver, [
            Var('Message', 'm')
        ], 'void')``
    ])

/**
 * Embed arrays passed to the compiler in the compiled module.
 */
export const generateEmbeddedArrays = ({ settings: { arrays } }: Compilation) =>
    Sequence(
        Object.entries(arrays).map(([arrayName, array]) =>
            Sequence([
                `commons_setArray("${arrayName}", createFloatArray(${array.length}))`,
                `commons_getArray("${arrayName}").set(${JSON.stringify(
                    Array.from(array)
                )})`,
            ])
        )
    )

export const generateNodeInitializations = ({
    precompilation,
}: Compilation): AstSequence =>
    Sequence([
        precompilation.traversals.all.map(
            (nodeId) => precompilation.nodes[nodeId].initialization
        ),
    ])

export const generateInletCallers = ({
    settings: { inletCallerSpecs },
    variableNamesIndex,
}: Compilation): AstSequence =>
    // Here not possible to assign directly the receiver because otherwise assemblyscript
    // doesn't export a function but a global instead.
    Sequence(
        Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) =>
            inletIds.map(
                (inletId) =>
                    Func(
                        variableNamesIndex.inletCallers[nodeId][inletId],
                        [Var('Message', 'm')],
                        'void'
                    )`${variableNamesIndex.nodes[nodeId].messageReceivers[inletId]}(m)`
            )
        )
    )

export const generateOutletListeners = (
    { settings: { outletListenerSpecs }, variableNamesIndex }: Compilation,
    generateOutletListener: (
        variableName: VariableName,
        nodeId: DspGraph.NodeId,
        outletId: DspGraph.PortletId
    ) => AstSequence
) =>
    Sequence(
        Object.entries(outletListenerSpecs).map(([nodeId, outletIds]) =>
            outletIds.map((outletId) => {
                const listenerVariableName =
                    variableNamesIndex.outletListeners[nodeId][outletId]
                return generateOutletListener(
                    listenerVariableName,
                    nodeId,
                    outletId
                )
            })
        )
    )

export const generatePortletsDeclarations = (
    compilation: Compilation
): AstSequence => {
    const {
        graph,
        precompilation,
        settings: { debug },
    } = compilation
    const graphTraversalNodes = traversal.toNodes(
        graph,
        precompilation.traversals.all
    )

    return Sequence([
        graphTraversalNodes.map((node) => {
            const precompiledNode = precompilation.nodes[node.id]

            return [
                // 1. Declares signal outlets
                Object.values(precompiledNode.signalOuts).map((outName) =>
                    Var('Float', outName, '0')
                ),

                // 2. Declares message receivers for all message inlets.
                Object.entries(precompiledNode.messageReceivers).map(
                    ([inletId, astFunc]) => {
                        // prettier-ignore
                        return Func(astFunc.name, astFunc.args, astFunc.returnType)`
                                ${astFunc.body}
                                throw new Error('[${node.type}], id "${node.id}", inlet "${inletId}", unsupported message : ' + msg_display(${astFunc.args[0].name})${
                                    debug
                                        ? " + '\\nDEBUG : remember, you must return from message receiver'"
                                        : ''})
                            `
                    }
                ),
            ]
        }),

        // 3. Declares message senders for all message outlets.
        // This needs to come after all message receivers are declared since we reference them here.
        graphTraversalNodes.map((node) =>
            Object.values(precompilation.nodes[node.id].messageSenders).map(
                ({
                    messageSenderName: sndName,
                    messageReceiverNames: rcvNames,
                }) =>
                    // prettier-ignore
                    Func(sndName, [
                    Var('Message', 'm')
                ], 'void')`
                    ${rcvNames.map(rcvName => `${rcvName}(m)`)}
                `
            )
        ),
    ])
}

export const generateLoop = (compilation: Compilation) => {
    const { variableNamesIndex, precompilation } = compilation
    const { traversals } = precompilation
    const { globs } = variableNamesIndex

    // prettier-ignore
    return ast`
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            _commons_emitFrame(${globs.frame})
            ${traversals.loop.map((nodeId) => precompilation.nodes[nodeId].loop)}
            ${globs.frame}++
        }
    `
}

export const generateImportsExports = (
    { precompilation }: Compilation,
    generateImport: (imprt: AstFunc) => AstSequence,
    generateExport: (xprt: GlobalCodeDefinitionExport) => AstSequence
): AstSequence =>
    Sequence([
        precompilation.dependencies.imports.map(generateImport),
        precompilation.dependencies.exports.map(generateExport),
    ])
