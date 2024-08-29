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
import {
    UserCompilationSettings,
    CompilerTarget,
    CompilationSettings,
} from './types'

/** Asserts user provided settings are valid (or throws error) and sets default values. */
export const validateSettings = (
    compilationSettings: UserCompilationSettings,
    target: CompilerTarget
): CompilationSettings => {
    const arrays = compilationSettings.arrays || {}
    const io = {
        messageReceivers: (compilationSettings.io || {}).messageReceivers || {},
        messageSenders: (compilationSettings.io || {}).messageSenders || {},
    }
    const debug = compilationSettings.debug || false
    const audio = compilationSettings.audio || {
        channelCount: { in: 2, out: 2 },
        bitDepth: 64,
    }
    if (![32, 64].includes(audio.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }

    return {
        audio,
        arrays,
        io,
        debug,
        target,
    }
}

class InvalidSettingsError extends Error {}
