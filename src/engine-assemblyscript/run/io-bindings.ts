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
                value: mapArray(spec, (inletId) => [
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
                value: mapArray(spec, (outletId) => [
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
            spec.forEach((outletId) => {
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
