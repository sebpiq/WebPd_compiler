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

import { GlobalCodeGenerator } from '../compile/types'
import { Sequence, Class, ConstVar, Func, Var } from '../ast/declare'
import { AstSequenceContent } from '../ast/types'

export const sked: GlobalCodeGenerator = ({ settings: { target } }) => {
    const content: Array<AstSequenceContent> = []
    if (target === 'assemblyscript') {
        content.push(`
            type SkedCallback = (event: SkedEvent) => void
            type SkedId = Int
            type SkedMode = Int
            type SkedEvent = string
        `)
    }

    // prettier-ignore
    return Sequence([
        ...content,
        
        /** 
         * Skeduler id that will never be used. 
         * Can be used as a "no id", or "null" value. 
         */
        ConstVar('SkedId', 'SKED_ID_NULL', '-1'),
        ConstVar('SkedId', 'SKED_ID_COUNTER_INIT', '1'),

        ConstVar('Int', '_SKED_WAIT_IN_PROGRESS', '0'),
        ConstVar('Int', '_SKED_WAIT_OVER', '1'),

        ConstVar('Int', '_SKED_MODE_WAIT', '0'),
        ConstVar('Int', '_SKED_MODE_SUBSCRIBE', '1'),

        // =========================== SKED API
        Class('SkedRequest', [
            Var('SkedId', 'id'),
            Var('SkedMode', 'mode'),
            Var('SkedCallback', 'callback'),
        ]),

        Class('Skeduler', [
            Var('Map<SkedEvent, Array<SkedId>>', 'events'),
            Var('Map<SkedId, SkedRequest>', 'requests'),
            Var('boolean', 'isLoggingEvents'),
            Var('Set<SkedEvent>', 'eventLog'),
            Var('SkedId', 'idCounter'),
        ]),

        /** Creates a new Skeduler. */
        Func('sked_create', [
            Var('boolean', 'isLoggingEvents')
        ], 'Skeduler')`
            return {
                eventLog: new Set(),
                events: new Map(),
                requests: new Map(),
                idCounter: SKED_ID_COUNTER_INIT,
                isLoggingEvents,
            }
        `,

        /** 
         * Asks the skeduler to wait for an event to occur and trigger a callback. 
         * If the event has already occurred, the callback is triggered instantly 
         * when calling the function.
         * Once triggered, the callback is forgotten.
         * @returns an id allowing to cancel the callback with {@link sked_cancel}
         */
        Func('sked_wait', [
            Var('Skeduler', 'skeduler'),
            Var('SkedEvent', 'event'),
            Var('SkedCallback', 'callback'),
        ], 'SkedId')`
            if (skeduler.isLoggingEvents === false) {
                throw new Error("Please activate skeduler's isLoggingEvents")
            }

            if (skeduler.eventLog.has(event)) {
                callback(event)
                return SKED_ID_NULL
            } else {
                return _sked_createRequest(skeduler, event, callback, _SKED_MODE_WAIT)
            }
        `,

        /** 
         * Asks the skeduler to wait for an event to occur and trigger a callback. 
         * If the event has already occurred, the callback is NOT triggered immediatelly.
         * Once triggered, the callback is forgotten.
         * @returns an id allowing to cancel the callback with {@link sked_cancel}
         */
        Func('sked_wait_future', [
            Var('Skeduler', 'skeduler'),
            Var('SkedEvent', 'event'),
            Var('SkedCallback', 'callback'),
        ], 'SkedId')`
            return _sked_createRequest(skeduler, event, callback, _SKED_MODE_WAIT)
        `,

        /** 
         * Asks the skeduler to trigger a callback everytime an event occurs 
         * @returns an id allowing to cancel the callback with {@link sked_cancel}
         */
        Func('sked_subscribe', [
            Var('Skeduler', 'skeduler'),
            Var('SkedEvent', 'event'),
            Var('SkedCallback', 'callback'),
        ], 'SkedId')`
            return _sked_createRequest(skeduler, event, callback, _SKED_MODE_SUBSCRIBE)
        `,

        /** Notifies the skeduler that an event has just occurred. */
        Func('sked_emit', [
            Var('Skeduler', 'skeduler'), 
            Var('SkedEvent', 'event')
        ], 'void')`
            if (skeduler.isLoggingEvents === true) {
                skeduler.eventLog.add(event)
            }
            if (skeduler.events.has(event)) {
                ${ConstVar('Array<SkedId>', 'skedIds', 'skeduler.events.get(event)')}
                ${ConstVar('Array<SkedId>', 'skedIdsStaying', '[]')}
                for (${Var('Int', 'i', '0')}; i < skedIds.length; i++) {
                    if (skeduler.requests.has(skedIds[i])) {
                        ${ConstVar('SkedRequest', 'request', 'skeduler.requests.get(skedIds[i])')}
                        request.callback(event)
                        if (request.mode === _SKED_MODE_WAIT) {
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
        Func('sked_cancel', [
            Var('Skeduler', 'skeduler'), 
            Var('SkedId', 'id'),
        ], 'void')`
            skeduler.requests.delete(id)
        `,

        // =========================== PRIVATE
        Func('_sked_createRequest', [
            Var('Skeduler', 'skeduler'),
            Var('SkedEvent', 'event'),
            Var('SkedCallback', 'callback'),
            Var('SkedMode', 'mode'),
        ], 'SkedId')`
            ${ConstVar('SkedId', 'id', '_sked_nextId(skeduler)')}
            ${ConstVar('SkedRequest', 'request', `{
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

        Func('_sked_nextId', [
            Var('Skeduler', 'skeduler')
        ], 'SkedId')`
            return skeduler.idCounter++
        `,
    ])
}
