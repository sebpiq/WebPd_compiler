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

export const commonsArrays: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ globalCode }) => Sequence([
        ConstVar(
            'Map<string, FloatArray>', 
            globalCode.commons!._ARRAYS!, 
            'new Map()'
        ),
        ConstVar(
            globalCode.sked!.Skeduler!, 
            globalCode.commons!._ARRAYS_SKEDULER!, 
            `${globalCode.sked!.create!}(false)`
        ),

        /** Gets an named array, throwing an error if the array doesn't exist. */
        Func(globalCode.commons!.getArray!, [
            Var('string', 'arrayName')
        ], 'FloatArray')`
            if (!${globalCode.commons!._ARRAYS!}.has(arrayName)) {
                throw new Error('Unknown array ' + arrayName)
            }
            return ${globalCode.commons!._ARRAYS!}.get(arrayName)
        `,

        Func(globalCode.commons!.hasArray!, [
            Var('string', 'arrayName')
        ], 'boolean')`
            return ${globalCode.commons!._ARRAYS!}.has(arrayName)
        `,

        Func(globalCode.commons!.setArray!, [
            Var('string', 'arrayName'), 
            Var('FloatArray', 'array'),
        ], 'void')`
            ${globalCode.commons!._ARRAYS!}.set(arrayName, array)
            ${globalCode.sked!.emit!}(${globalCode.commons!._ARRAYS_SKEDULER!}, arrayName)
        `,

        /** 
         * @param callback Called immediately if the array exists, and subsequently, everytime 
         * the array is set again.
         * @returns An id that can be used to cancel the subscription.
         */
        Func(globalCode.commons!.subscribeArrayChanges!, [
            Var('string', 'arrayName'), 
            Var(globalCode.sked!.Callback!, 'callback'),
        ], globalCode.sked!.Id!)`
            const id = ${globalCode.sked!.subscribe!}(${globalCode.commons!._ARRAYS_SKEDULER!}, arrayName, callback)
            if (${globalCode.commons!._ARRAYS!}.has(arrayName)) {
                callback(arrayName)
            }
            return id
        `,

        /** 
         * @param id The id received when subscribing.
         */
        Func(globalCode.commons!.cancelArrayChangesSubscription!, [
            Var(globalCode.sked!.Id!, 'id')
        ], 'void')`
            ${globalCode.sked!.cancel!}(${globalCode.commons!._ARRAYS_SKEDULER!}, id)
        `,
    ]),

    exports: ({ globalCode }) => [
        globalCode.commons!.getArray!,
        globalCode.commons!.setArray!,
    ],
    dependencies: [sked],
}

export const commonsWaitFrame: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ globalCode }) => Sequence([
        ConstVar(
            globalCode.sked!.Skeduler!, 
            globalCode.commons!._FRAME_SKEDULER!, 
            `${globalCode.sked!.create!}(false)`,
        ),

        Func(globalCode.commons!._emitFrame!, [
            Var('Int', 'frame')
        ], 'void')`
            ${globalCode.sked!.emit!}(${globalCode.commons!._FRAME_SKEDULER!}, frame.toString())
        `,

        /** 
         * Schedules a callback to be called at the given frame.
         * If the frame already occurred, or is the current frame, the callback won't be executed.
         */
        Func(globalCode.commons!.waitFrame!, [
            Var('Int', 'frame'), 
            Var(globalCode.sked!.Callback!, 'callback'),
        ], globalCode.sked!.Id!)`
            return ${globalCode.sked!.waitFuture!}(${globalCode.commons!._FRAME_SKEDULER!}, frame.toString(), callback)
        `,

        /** 
         * Cancels waiting for a frame to occur.
         */
        Func(globalCode.commons!.cancelWaitFrame!, [
            Var(globalCode.sked!.Id!, 'id')
        ], 'void')`
            ${globalCode.sked!.cancel!}(${globalCode.commons!._FRAME_SKEDULER!}, id)
        `,
    ]),
    dependencies: [sked],
}
