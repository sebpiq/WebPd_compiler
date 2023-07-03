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
import CORE_ASC from './core.asc'
import CORE_JS from './core.js.txt'
import BUF_ASC from './buf.asc'
import BUF_JS from './buf.generated.js.txt'
import SKED_ASC from './sked.asc'
import SKED_JS from './sked.generated.js.txt'
import MSG_ASC from './msg.asc'
import MSG_JS from './msg.js.txt'
import COMMONS_ASC from './commons.asc'
import COMMONS_JS from './commons.generated.js.txt'
import FS_ASC from './fs.asc'
import FS_JS from './fs.generated.js.txt'

import { replaceCoreCodePlaceholders } from '../compile-helpers'
import { SharedCodeGenerator } from '../types'

/** @deprecated : should be removed when individual functions below are integrated */
export const generateCoreCode: SharedCodeGenerator = ({ target, audioSettings }) => {
    switch (target) {
        case 'assemblyscript':
            return (
                replaceCoreCodePlaceholders(
                    audioSettings.bitDepth,
                    CORE_ASC
                ) +
                BUF_ASC +
                SKED_ASC +
                COMMONS_ASC +
                MSG_ASC +
                FS_ASC
            )
        case 'javascript':
            return (
                replaceCoreCodePlaceholders(
                    audioSettings.bitDepth,
                    CORE_JS
                ) +
                BUF_JS +
                SKED_JS +
                COMMONS_JS +
                MSG_JS +
                FS_JS
            )
    }
}

export const core: SharedCodeGenerator = ({ target, audioSettings }) => {
    switch (target) {
        case 'assemblyscript':
            return replaceCoreCodePlaceholders(audioSettings.bitDepth, CORE_ASC)
        case 'javascript':
            return replaceCoreCodePlaceholders(audioSettings.bitDepth, CORE_JS)
    }
}

export const buf: SharedCodeGenerator = ({ target }) => {
    switch (target) {
        case 'assemblyscript':
            return BUF_ASC
        case 'javascript':
            return BUF_JS
    }
}

export const sked: SharedCodeGenerator = ({ target }) => {
    switch (target) {
        case 'assemblyscript':
            return SKED_ASC
        case 'javascript':
            return SKED_JS
    }
}

export const commons: SharedCodeGenerator = ({ target }) => {
    switch (target) {
        case 'assemblyscript':
            return COMMONS_ASC
        case 'javascript':
            return COMMONS_JS
    }
}

export const msg: SharedCodeGenerator = ({ target }) => {
    switch (target) {
        case 'assemblyscript':
            return MSG_ASC
        case 'javascript':
            return MSG_JS
    }
}

export const fs: SharedCodeGenerator = ({ target }) => {
    switch (target) {
        case 'assemblyscript':
            return FS_ASC
        case 'javascript':
            return FS_JS
    }
}