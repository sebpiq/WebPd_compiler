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

import { GlobalDefinitions } from '../../compile/types'
import { Sequence, Class, ConstVar, Func, Var } from '../../ast/declare'
import { AstSequenceContent } from '../../ast/types'
import { SkedNamespaceAll } from './types'

const NAMESPACE = 'sked'

export const sked: GlobalDefinitions<keyof SkedNamespaceAll> = {
    namespace: NAMESPACE,
    code: ({ ns: sked }, { settings: { target } }) => {
        const content: Array<AstSequenceContent> = []
        if (target === 'assemblyscript') {
            content.push(`
                type ${sked.Callback} = (event: ${sked.Event}) => void
                type ${sked.Id} = Int
                type ${sked.Mode} = Int
                type ${sked.Event} = string
            `)
        }

        // prettier-ignore
        return Sequence([
            ...content,
            
            /** 
             * Skeduler id that will never be used. 
             * Can be used as a "no id", or "null" value. 
             */
            ConstVar(sked.Id, sked.ID_NULL, '-1'),

            ConstVar(sked.Id, sked._ID_COUNTER_INIT, '1'),

            ConstVar('Int', sked._MODE_WAIT, '0'),
            ConstVar('Int', sked._MODE_SUBSCRIBE, '1'),

            // =========================== SKED API
            Class(sked._Request, [
                Var(sked.Id, 'id'),
                Var(sked.Mode, 'mode'),
                Var(sked.Callback, 'callback'),
            ]),

            Class(sked.Skeduler, [
                Var(`Map<${sked.Event}, Array<${sked.Id}>>`, 'events'),
                Var(`Map<${sked.Id}, ${sked._Request}>`, 'requests'),
                Var('boolean', 'isLoggingEvents'),
                Var(`Set<${sked.Event}>`, 'eventLog'),
                Var(sked.Id, 'idCounter'),
            ]),

            /** Creates a new Skeduler. */
            Func(sked.create, [
                Var('boolean', 'isLoggingEvents')
            ], sked.Skeduler)`
                return {
                    eventLog: new Set(),
                    events: new Map(),
                    requests: new Map(),
                    idCounter: ${sked._ID_COUNTER_INIT},
                    isLoggingEvents,
                }
            `,

            /** 
             * Asks the skeduler to wait for an event to occur and trigger a callback. 
             * If the event has already occurred, the callback is triggered instantly 
             * when calling the function.
             * Once triggered, the callback is forgotten.
             * @returns an id allowing to cancel the callback with {@link ${sked.cancel}}
             */
            Func(sked.wait, [
                Var(sked.Skeduler, 'skeduler'),
                Var(sked.Event, 'event'),
                Var(sked.Callback, 'callback'),
            ], sked.Id)`
                if (skeduler.isLoggingEvents === false) {
                    throw new Error("Please activate skeduler's isLoggingEvents")
                }

                if (skeduler.eventLog.has(event)) {
                    callback(event)
                    return ${sked.ID_NULL}
                } else {
                    return ${sked._createRequest}(skeduler, event, callback, ${sked._MODE_WAIT})
                }
            `,

            /** 
             * Asks the skeduler to wait for an event to occur and trigger a callback. 
             * If the event has already occurred, the callback is NOT triggered immediatelly.
             * Once triggered, the callback is forgotten.
             * @returns an id allowing to cancel the callback with {@link sked.cancel}
             */
            Func(sked.waitFuture, [
                Var(sked.Skeduler, 'skeduler'),
                Var(sked.Event, 'event'),
                Var(sked.Callback, 'callback'),
            ], sked.Id)`
                return ${sked._createRequest}(skeduler, event, callback, ${sked._MODE_WAIT})
            `,

            /** 
             * Asks the skeduler to trigger a callback everytime an event occurs 
             * @returns an id allowing to cancel the callback with {@link sked.cancel}
             */
            Func(sked.subscribe, [
                Var(sked.Skeduler, 'skeduler'),
                Var(sked.Event, 'event'),
                Var(sked.Callback, 'callback'),
            ], sked.Id)`
                return ${sked._createRequest}(skeduler, event, callback, ${sked._MODE_SUBSCRIBE})
            `,

            /** Notifies the skeduler that an event has just occurred. */
            Func(sked.emit, [
                Var(sked.Skeduler, 'skeduler'), 
                Var(sked.Event, 'event')
            ], 'void')`
                if (skeduler.isLoggingEvents === true) {
                    skeduler.eventLog.add(event)
                }
                if (skeduler.events.has(event)) {
                    ${ConstVar(`Array<${sked.Id}>`, 'skedIds', 'skeduler.events.get(event)')}
                    ${ConstVar(`Array<${sked.Id}>`, 'skedIdsStaying', '[]')}
                    for (${Var('Int', 'i', '0')}; i < skedIds.length; i++) {
                        if (skeduler.requests.has(skedIds[i])) {
                            ${ConstVar(sked._Request, 'request', 'skeduler.requests.get(skedIds[i])')}
                            request.callback(event)
                            if (request.mode === ${sked._MODE_WAIT}) {
                                skeduler.requests.delete(request.id)
                            } else {
                                skedIdsStaying.push(request.id)
                            }
                        }
                    }
                    skeduler.events.set(event, skedIdsStaying)
                }
            `,

            /** Cancels a callback */
            Func(sked.cancel, [
                Var(sked.Skeduler, 'skeduler'), 
                Var(sked.Id, 'id'),
            ], 'void')`
                skeduler.requests.delete(id)
            `,

            // =========================== PRIVATE
            Func(sked._createRequest, [
                Var(sked.Skeduler, 'skeduler'),
                Var(sked.Event, 'event'),
                Var(sked.Callback, 'callback'),
                Var(sked.Mode, 'mode'),
            ], sked.Id)`
                ${ConstVar(sked.Id, 'id', `${sked._nextId}(skeduler)`)}
                ${ConstVar(sked._Request, 'request', `{
                    id, 
                    mode, 
                    callback,
                }`)}
                skeduler.requests.set(id, request)
                if (!skeduler.events.has(event)) {
                    skeduler.events.set(event, [id])    
                } else {
                    skeduler.events.get(event).push(id)
                }
                return id
            `,

            Func(sked._nextId, [
                Var(sked.Skeduler, 'skeduler')
            ], sked.Id)`
                return skeduler.idCounter++
            `,
        ])
    },
}
