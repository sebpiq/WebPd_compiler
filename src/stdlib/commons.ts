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

import { GlobalCodeGeneratorWithSettings } from '../types'
import { sked } from './sked'

export const commonsCore: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        const _commons_ENGINE_LOGGED_SKEDULER = sked_create(true)
        const _commons_FRAME_SKEDULER = sked_create(false)

        function _commons_emitEngineConfigure ${Func([], 'void')} {
            sked_emit(_commons_ENGINE_LOGGED_SKEDULER, 'configure')
        }
        
        function _commons_emitFrame ${Func([Var('frame', 'Int')], 'void')} {
            sked_emit(_commons_FRAME_SKEDULER, frame.toString())
        }
    `,
    dependencies: [sked],
}

export const commonsArrays: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        const ${Var('_commons_ARRAYS', 'Map<string, FloatArray>')} = new Map()
        const ${Var(
            '_commons_ARRAYS_SKEDULER',
            'Skeduler'
        )} = sked_create(false)

        /** Gets an named array, throwing an error if the array doesn't exist. */
        function commons_getArray ${Func(
            [Var('arrayName', 'string')],
            'FloatArray'
        )} {
            if (!_commons_ARRAYS.has(arrayName)) {
                throw new Error('Unknown array ' + arrayName)
            }
            return _commons_ARRAYS.get(arrayName)
        }

        function commons_hasArray ${Func(
            [Var('arrayName', 'string')],
            'boolean'
        )} {
            return _commons_ARRAYS.has(arrayName)
        }

        function commons_setArray ${Func(
            [Var('arrayName', 'string'), Var('array', 'FloatArray')],
            'void'
        )} {
            _commons_ARRAYS.set(arrayName, array)
            sked_emit(_commons_ARRAYS_SKEDULER, arrayName)
        }

        /** 
         * @param callback Called immediately if the array exists, and subsequently, everytime 
         * the array is set again.
         * @returns An id that can be used to cancel the subscription.
         */
        function commons_subscribeArrayChanges ${Func(
            [Var('arrayName', 'string'), Var('callback', 'SkedCallback')],
            'SkedId'
        )} {
            const id = sked_subscribe(_commons_ARRAYS_SKEDULER, arrayName, callback)
            if (_commons_ARRAYS.has(arrayName)) {
                callback(arrayName)
            }
            return id
        }

        /** 
         * @param id The id received when subscribing.
         */
        function commons_cancelArrayChangesSubscription ${Func(
            [Var('id', 'SkedId')],
            'void'
        )} {
            sked_cancel(_commons_ARRAYS_SKEDULER, id)
        }
    `,

    exports: [{ name: 'commons_getArray' }, { name: 'commons_setArray' }],
}

export const commonsWaitEngineConfigure: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        /** 
         * @param callback Called when the engine is configured, or immediately if the engine
         * was already configured.
         */
        function commons_waitEngineConfigure ${Func(
            [Var('callback', 'SkedCallback')],
            'void'
        )} {
            sked_wait(_commons_ENGINE_LOGGED_SKEDULER, 'configure', callback)
        }
    `,
    dependencies: [commonsCore],
}

export const commonsWaitFrame: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        /** 
         * Schedules a callback to be called at the given frame.
         * If the frame already occurred, or is the current frame, the callback won't be executed.
         */
        function commons_waitFrame ${Func(
            [Var('frame', 'Int'), Var('callback', 'SkedCallback')],
            'SkedId'
        )} {
            return sked_wait_future(_commons_FRAME_SKEDULER, frame.toString(), callback)
        }

        /** 
         * Cancels waiting for a frame to occur.
         */
        function commons_cancelWaitFrame ${Func(
            [Var('id', 'SkedId')],
            'void'
        )} {
            sked_cancel(_commons_FRAME_SKEDULER, id)
        }

    `,
    dependencies: [commonsCore],
}
