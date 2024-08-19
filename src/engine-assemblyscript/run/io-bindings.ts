import { VariableName } from '../../ast/types'
import { DspGraph } from '../../dsp-graph'
import { mapArray } from '../../functional-helpers'
import { Bindings, Engine, Message } from '../../run/types'
import { EngineLifecycleRawModuleWithDependencies } from './engine-lifecycle-bindings'
import {
    lowerMessage,
    liftMessage,
} from '../../stdlib/msg/bindings-assemblyscript'
import { EngineContext, MessagePointer } from './types'

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

export const createIoMessageReceiversBindings = ({
    metadata,
    refs,
}: EngineContext<IoRawModuleWithDependencies>) =>
    Object.entries(metadata.settings.io.messageReceivers).reduce(
        (bindings, [nodeId, spec]) => ({
            ...bindings,
            [nodeId]: {
                type: 'proxy',
                value: mapArray(spec.portletIds, (inletId) => [
                    inletId,
                    (message: Message) => {
                        const messagePointer = lowerMessage(
                            refs.rawModule!,
                            message
                        )
                        refs.rawModule!.io.messageReceivers[nodeId]![inletId]!(
                            messagePointer
                        )
                    },
                ]),
            } as const,
        }),
        {} as Bindings<Engine['io']['messageReceivers']>
    )

export const createIoMessageSendersBindings = ({
    metadata,
}: EngineContext<IoRawModuleWithDependencies>) =>
    Object.entries(metadata.settings.io.messageSenders).reduce(
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

export const ioMsgSendersImports = ({
    metadata,
    refs,
}: EngineContext<IoRawModuleWithDependencies>) => {
    const wasmImports: IoImports = {}
    const { variableNamesIndex } = metadata.compilation
    Object.entries(metadata.settings.io.messageSenders).forEach(
        ([nodeId, spec]) => {
            spec.portletIds.forEach((outletId) => {
                const listenerName =
                    variableNamesIndex.io.messageSenders[nodeId]![outletId]!
                wasmImports[listenerName] = (messagePointer) => {
                    const message = liftMessage(refs.rawModule!, messagePointer)
                    refs.engine!.io!.messageSenders[nodeId]![outletId]!(message)
                }
            })
        }
    )
    return wasmImports
}
