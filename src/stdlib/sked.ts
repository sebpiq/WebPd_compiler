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

import { renderIf } from '../functional-helpers'
import { GlobalCodeGenerator } from '../compile/types'

export const sked: GlobalCodeGenerator = ({
    macros: { Var, Func },
    target,
}) => `
    ${renderIf(
        target === 'assemblyscript',
        `
            type SkedCallback = (event: SkedEvent) => void
            type SkedId = Int
            type SkedMode = Int
            type SkedEvent = string
        `
    )}

    /** 
     * Skeduler id that will never be used. 
     * Can be used as a "no id", or "null" value. 
     */
    const ${Var('SKED_ID_NULL', 'SkedId')} = -1
    const ${Var('SKED_ID_COUNTER_INIT', 'SkedId')} = 1

    const ${Var('_SKED_WAIT_IN_PROGRESS', 'Int')} = 0
    const ${Var('_SKED_WAIT_OVER', 'Int')} = 1

    const ${Var('_SKED_MODE_WAIT', 'Int')} = 0
    const ${Var('_SKED_MODE_SUBSCRIBE', 'Int')} = 1

    // =========================== SKED API
    class SkedRequest {
        ${Var('id', 'SkedId')}
        ${Var('mode', 'SkedMode')}
    }

    class Skeduler {
        ${Var('requests', 'Map<SkedEvent, Array<SkedRequest>>')}
        ${Var('callbacks', 'Map<SkedId, SkedCallback>')}
        ${Var('isLoggingEvents', 'boolean')}
        ${Var('eventLog', 'Set<SkedEvent>')}
        ${Var('idCounter', 'SkedId')}
    }

    /** Creates a new Skeduler. */
    function sked_create ${Func(
        [Var('isLoggingEvents', 'boolean')],
        'Skeduler'
    )} {
        return {
            eventLog: new Set(),
            requests: new Map(),
            callbacks: new Map(),
            idCounter: SKED_ID_COUNTER_INIT,
            isLoggingEvents,
        }
    }

    /** 
     * Asks the skeduler to wait for an event to occur and trigger a callback. 
     * If the event has already occurred, the callback is triggered instantly 
     * when calling the function.
     * Once triggered, the callback is forgotten.
     * @returns an id allowing to cancel the callback with {@link sked_cancel}
     */
    function sked_wait ${Func(
        [
            Var('skeduler', 'Skeduler'),
            Var('event', 'SkedEvent'),
            Var('callback', 'SkedCallback'),
        ],
        'SkedId'
    )} {
        if (skeduler.isLoggingEvents === false) {
            throw new Error("Please activate skeduler's isLoggingEvents")
        }

        if (skeduler.eventLog.has(event)) {
            callback(event)
            return SKED_ID_NULL
        } else {
            return _sked_createRequest(skeduler, event, callback, _SKED_MODE_WAIT)
        }
    }

    /** 
     * Asks the skeduler to wait for an event to occur and trigger a callback. 
     * If the event has already occurred, the callback is NOT triggered immediatelly.
     * Once triggered, the callback is forgotten.
     * @returns an id allowing to cancel the callback with {@link sked_cancel}
     */
    function sked_wait_future ${Func(
        [
            Var('skeduler', 'Skeduler'),
            Var('event', 'SkedEvent'),
            Var('callback', 'SkedCallback'),
        ],
        'SkedId'
    )} {
        return _sked_createRequest(skeduler, event, callback, _SKED_MODE_WAIT)
    }

    /** 
     * Asks the skeduler to trigger a callback everytime an event occurs 
     * @returns an id allowing to cancel the callback with {@link sked_cancel}
     */
    function sked_subscribe ${Func(
        [
            Var('skeduler', 'Skeduler'),
            Var('event', 'SkedEvent'),
            Var('callback', 'SkedCallback'),
        ],
        'SkedId'
    )} {
        return _sked_createRequest(skeduler, event, callback, _SKED_MODE_SUBSCRIBE)
    }

    /** Notifies the skeduler that an event has just occurred. */
    function sked_emit ${Func(
        [Var('skeduler', 'Skeduler'), Var('event', 'SkedEvent')],
        'void'
    )} {
        if (skeduler.isLoggingEvents === true) {
            skeduler.eventLog.add(event)
        }
        if (skeduler.requests.has(event)) {
            const ${Var(
                'requests',
                'Array<SkedRequest>'
            )} = skeduler.requests.get(event)
            const ${Var('requestsStaying', 'Array<SkedRequest>')} = []
            for (let ${Var('i', 'Int')} = 0; i < requests.length; i++) {
                const ${Var('request', 'SkedRequest')} = requests[i]
                if (skeduler.callbacks.has(request.id)) {
                    skeduler.callbacks.get(request.id)(event)
                    if (request.mode === _SKED_MODE_WAIT) {
                        skeduler.callbacks.delete(request.id)
                    } else {
                        requestsStaying.push(request)
                    }
                }
            }
            skeduler.requests.set(event, requestsStaying)
        }
    }

    /** Cancels a callback */
    function sked_cancel ${Func(
        [Var('skeduler', 'Skeduler'), Var('id', 'SkedId')],
        'void'
    )} {
        skeduler.callbacks.delete(id)
    }

    // =========================== PRIVATE
    function _sked_createRequest ${Func(
        [
            Var('skeduler', 'Skeduler'),
            Var('event', 'SkedEvent'),
            Var('callback', 'SkedCallback'),
            Var('mode', 'SkedMode'),
        ],
        'SkedId'
    )} {
        const ${Var('id', 'SkedId')} = _sked_nextId(skeduler)
        const ${Var('request', 'SkedRequest')} = {id, mode}
        skeduler.callbacks.set(id, callback)
        if (!skeduler.requests.has(event)) {
            skeduler.requests.set(event, [request])    
        } else {
            skeduler.requests.get(event).push(request)
        }
        return id
    }

    function _sked_nextId ${Func([Var('skeduler', 'Skeduler')], 'SkedId')} {
        return skeduler.idCounter++
    }
`
