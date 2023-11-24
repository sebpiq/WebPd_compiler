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

import { Sequence, ConstVar, Func, Var } from '../ast/declare'
import { GlobalCodeGeneratorWithSettings } from '../compile/types'
import { sked } from './sked'

export const commonsCore: GlobalCodeGeneratorWithSettings = {
    codeGenerator: () => Sequence([
        ConstVar('Skeduler', '_commons_ENGINE_LOGGED_SKEDULER', 'sked_create(true)'),
        ConstVar('Skeduler', '_commons_FRAME_SKEDULER', 'sked_create(false)'),
        Func('_commons_emitEngineConfigure')`
            sked_emit(_commons_ENGINE_LOGGED_SKEDULER, 'configure')
        `,
        Func('_commons_emitFrame', [
            Var('Int', 'frame')
        ], 'void')`
            sked_emit(_commons_FRAME_SKEDULER, frame.toString())
        `
    ]),
    dependencies: [sked],
}

export const commonsArrays: GlobalCodeGeneratorWithSettings = {
    codeGenerator: () => Sequence([
        ConstVar('Map<string, FloatArray>', '_commons_ARRAYS', 'new Map()'),
        ConstVar('Skeduler', '_commons_ARRAYS_SKEDULER', 'sked_create(false)'),

        /** Gets an named array, throwing an error if the array doesn't exist. */
        Func('commons_getArray', [
            Var('string', 'arrayName')
        ], 'FloatArray')`
            if (!_commons_ARRAYS.has(arrayName)) {
                throw new Error('Unknown array ' + arrayName)
            }
            return _commons_ARRAYS.get(arrayName)
        `,

        Func('commons_hasArray', [
            Var('string', 'arrayName')
        ], 'boolean')`
            return _commons_ARRAYS.has(arrayName)
        `,

        Func('commons_setArray', [
            Var('string', 'arrayName'), 
            Var('FloatArray', 'array'),
        ], 'void')`
            _commons_ARRAYS.set(arrayName, array)
            sked_emit(_commons_ARRAYS_SKEDULER, arrayName)
        `,

        /** 
         * @param callback Called immediately if the array exists, and subsequently, everytime 
         * the array is set again.
         * @returns An id that can be used to cancel the subscription.
         */
        Func('commons_subscribeArrayChanges', [
            Var('string', 'arrayName'), 
            Var('SkedCallback', 'callback'),
        ], 'SkedId')`
            const id = sked_subscribe(_commons_ARRAYS_SKEDULER, arrayName, callback)
            if (_commons_ARRAYS.has(arrayName)) {
                callback(arrayName)
            }
            return id
        `,

        /** 
         * @param id The id received when subscribing.
         */
        Func('commons_cancelArrayChangesSubscription', [
            Var('SkedId', 'id')
        ], 'void')`
            sked_cancel(_commons_ARRAYS_SKEDULER, id)
        `,
    ]),

    exports: [{ name: 'commons_getArray' }, { name: 'commons_setArray' }],
}

export const commonsWaitEngineConfigure: GlobalCodeGeneratorWithSettings = {
    codeGenerator: () => Sequence([
        /** 
         * @param callback Called when the engine is configured, or immediately if the engine
         * was already configured.
         */
        Func('commons_waitEngineConfigure',[
            Var('SkedCallback', 'callback'),
        ], 'void')`
            sked_wait(_commons_ENGINE_LOGGED_SKEDULER, 'configure', callback)
        `
    ]),
    dependencies: [commonsCore],
}

export const commonsWaitFrame: GlobalCodeGeneratorWithSettings = {
    codeGenerator: () => Sequence([
        /** 
         * Schedules a callback to be called at the given frame.
         * If the frame already occurred, or is the current frame, the callback won't be executed.
         */
        Func('commons_waitFrame', [
            Var('Int', 'frame'), 
            Var('SkedCallback', 'callback'),
        ], 'SkedId')`
            return sked_wait_future(_commons_FRAME_SKEDULER, frame.toString(), callback)
        `,

        /** 
         * Cancels waiting for a frame to occur.
         */
        Func('commons_cancelWaitFrame', [
            Var('SkedId', 'id')
        ], 'void')`
            sked_cancel(_commons_FRAME_SKEDULER, id)
        `,
    ]),
    dependencies: [commonsCore],
}
