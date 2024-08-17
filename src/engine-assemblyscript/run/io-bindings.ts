import { VariableName } from '../../ast/types'
import { DspGraph } from '../../dsp-graph'
import { mapArray } from '../../functional-helpers'
import { Bindings, Engine, Message, EngineMetadata } from '../../run/types'
import { EngineLifecycleRawModuleWithDependencies } from './engine-lifecycle-bindings'
import { lowerMessage, liftMessage } from '../../stdlib/msg/bindings-assemblyscript'
import { EngineData, ForwardReferences, MessagePointer } from './types'

export interface IoRawModule {
    io: {
        readonly messageReceivers: {
            [nodeId: DspGraph.NodeId]: {
                [inletId: DspGraph.PortletId]: (
                    messagePointer: MessagePointer
                ) => void
            }
        }
    }
}

type IoImports = {
    [listenerName: VariableName]: (messagePointer: MessagePointer) => void
}

export type IoRawModuleWithDependencies = IoRawModule &
    EngineLifecycleRawModuleWithDependencies

export const createIoMessageReceiversBindings = (
    rawModule: IoRawModuleWithDependencies,
    engineData: EngineData
) =>
    Object.entries(engineData.metadata.settings.io.messageReceivers).reduce(
        (bindings, [nodeId, spec]) => ({
            ...bindings,
            [nodeId]: {
                type: 'proxy',
                value: mapArray(spec.portletIds, (inletId) => [
                    inletId,
                    (message: Message) => {
                        const messagePointer = lowerMessage(rawModule, message)
                        rawModule.io.messageReceivers[nodeId]![inletId]!(
                            messagePointer
                        )
                    },
                ]),
            } as const,
        }),
        {} as Bindings<Engine['io']['messageReceivers']>
    )

export const createIoMessageSendersBindings = (
    _: IoRawModuleWithDependencies,
    engineData: EngineData
) =>
    Object.entries(engineData.metadata.settings.io.messageSenders).reduce(
        (bindings, [nodeId, spec]) => ({
            ...bindings,
            [nodeId]: {
                type: 'proxy',
                value: mapArray(spec.portletIds, (outletId) => [
                    outletId,
                    (_: Message) => undefined,
                ]),
            } as const,
        }),
        {} as Bindings<Engine['io']['messageSenders']>
    )

export const ioMsgSendersImports = (
    forwardReferences: ForwardReferences<IoRawModuleWithDependencies>,
    engineData: EngineData
) => {
    const wasmImports: IoImports = {}
    const { variableNamesIndex } = engineData.metadata.compilation
    Object.entries(engineData.metadata.settings.io.messageSenders).forEach(
        ([nodeId, spec]) => {
            spec.portletIds.forEach((outletId) => {
                const listenerName =
                    variableNamesIndex.io.messageSenders[nodeId]![outletId]!
                wasmImports[listenerName] = (messagePointer) => {
                    const message = liftMessage(
                        forwardReferences.rawModule!,
                        messagePointer
                    )
                    forwardReferences.engine!.io!.messageSenders[nodeId]![
                        outletId
                    ]!(message)
                }
            })
        }
    )
    return wasmImports
}
