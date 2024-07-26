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

export const sked: GlobalCodeGenerator = ({ globalCode, settings: { target } }) => {
    const content: Array<AstSequenceContent> = []
    if (target === 'assemblyscript') {
        content.push(`
            type ${globalCode.sked!.Callback!} = (event: ${globalCode.sked!.Event!}) => void
            type ${globalCode.sked!.Id!} = Int
            type ${globalCode.sked!.Mode!} = Int
            type ${globalCode.sked!.Event!} = string
        `)
    }

    // prettier-ignore
    return Sequence([
        ...content,
        
        /** 
         * Skeduler id that will never be used. 
         * Can be used as a "no id", or "null" value. 
         */
        ConstVar(globalCode.sked!.Id!, globalCode.sked!.ID_NULL!, '-1'),

        ConstVar(globalCode.sked!.Id!, globalCode.sked!._ID_COUNTER_INIT!, '1'),

        ConstVar('Int', globalCode.sked!._MODE_WAIT!, '0'),
        ConstVar('Int', globalCode.sked!._MODE_SUBSCRIBE!, '1'),

        // =========================== SKED API
        Class(globalCode.sked!._Request!, [
            Var(globalCode.sked!.Id!, 'id'),
            Var(globalCode.sked!.Mode!, 'mode'),
            Var(globalCode.sked!.Callback!, 'callback'),
        ]),

        Class(globalCode.sked!.Skeduler!, [
            Var(`Map<${globalCode.sked!.Event!}, Array<${globalCode.sked!.Id!}>>`, 'events'),
            Var(`Map<${globalCode.sked!.Id!}, ${globalCode.sked!._Request!}>`, 'requests'),
            Var('boolean', 'isLoggingEvents'),
            Var(`Set<${globalCode.sked!.Event!}>`, 'eventLog'),
            Var(globalCode.sked!.Id!, 'idCounter'),
        ]),

        /** Creates a new Skeduler. */
        Func(globalCode.sked!.create!, [
            Var('boolean', 'isLoggingEvents')
        ], globalCode.sked!.Skeduler!)`
            return {
                eventLog: new Set(),
                events: new Map(),
                requests: new Map(),
                idCounter: ${globalCode.sked!._ID_COUNTER_INIT!},
                isLoggingEvents,
            }
        `,

        /** 
         * Asks the skeduler to wait for an event to occur and trigger a callback. 
         * If the event has already occurred, the callback is triggered instantly 
         * when calling the function.
         * Once triggered, the callback is forgotten.
         * @returns an id allowing to cancel the callback with {@link ${globalCode.sked!.cancel!}}
         */
        Func(globalCode.sked!.wait!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler'),
            Var(globalCode.sked!.Event!, 'event'),
            Var(globalCode.sked!.Callback!, 'callback'),
        ], globalCode.sked!.Id!)`
            if (skeduler.isLoggingEvents === false) {
                throw new Error("Please activate skeduler's isLoggingEvents")
            }

            if (skeduler.eventLog.has(event)) {
                callback(event)
                return ${globalCode.sked!.ID_NULL!}
            } else {
                return ${globalCode.sked!._createRequest!}(skeduler, event, callback, ${globalCode.sked!._MODE_WAIT!})
            }
        `,

        /** 
         * Asks the skeduler to wait for an event to occur and trigger a callback. 
         * If the event has already occurred, the callback is NOT triggered immediatelly.
         * Once triggered, the callback is forgotten.
         * @returns an id allowing to cancel the callback with {@link sked.cancel}
         */
        Func(globalCode.sked!.waitFuture!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler'),
            Var(globalCode.sked!.Event!, 'event'),
            Var(globalCode.sked!.Callback!, 'callback'),
        ], globalCode.sked!.Id!)`
            return ${globalCode.sked!._createRequest!}(skeduler, event, callback, ${globalCode.sked!._MODE_WAIT!})
        `,

        /** 
         * Asks the skeduler to trigger a callback everytime an event occurs 
         * @returns an id allowing to cancel the callback with {@link sked.cancel}
         */
        Func(globalCode.sked!.subscribe!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler'),
            Var(globalCode.sked!.Event!, 'event'),
            Var(globalCode.sked!.Callback!, 'callback'),
        ], globalCode.sked!.Id!)`
            return ${globalCode.sked!._createRequest!}(skeduler, event, callback, ${globalCode.sked!._MODE_SUBSCRIBE!})
        `,

        /** Notifies the skeduler that an event has just occurred. */
        Func(globalCode.sked!.emit!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler'), 
            Var(globalCode.sked!.Event!, 'event')
        ], 'void')`
            if (skeduler.isLoggingEvents === true) {
                skeduler.eventLog.add(event)
            }
            if (skeduler.events.has(event)) {
                ${ConstVar(`Array<${globalCode.sked!.Id!}>`, 'skedIds', 'skeduler.events.get(event)')}
                ${ConstVar(`Array<${globalCode.sked!.Id!}>`, 'skedIdsStaying', '[]')}
                for (${Var('Int', 'i', '0')}; i < skedIds.length; i++) {
                    if (skeduler.requests.has(skedIds[i])) {
                        ${ConstVar(globalCode.sked!._Request!, 'request', 'skeduler.requests.get(skedIds[i])')}
                        request.callback(event)
                        if (request.mode === ${globalCode.sked!._MODE_WAIT!}) {
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
        Func(globalCode.sked!.cancel!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler'), 
            Var(globalCode.sked!.Id!, 'id'),
        ], 'void')`
            skeduler.requests.delete(id)
        `,

        // =========================== PRIVATE
        Func(globalCode.sked!._createRequest!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler'),
            Var(globalCode.sked!.Event!, 'event'),
            Var(globalCode.sked!.Callback!, 'callback'),
            Var(globalCode.sked!.Mode!, 'mode'),
        ], globalCode.sked!.Id!)`
            ${ConstVar(globalCode.sked!.Id!, 'id', `${globalCode.sked!._nextId!}(skeduler)`)}
            ${ConstVar(globalCode.sked!._Request!, 'request', `{
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

        Func(globalCode.sked!._nextId!, [
            Var(globalCode.sked!.Skeduler!, 'skeduler')
        ], globalCode.sked!.Id!)`
            return skeduler.idCounter++
        `,
    ])
}
