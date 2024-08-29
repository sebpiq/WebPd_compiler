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

export interface SkedNamespacePublic {
    ID_NULL: VariableName
    Id: VariableName
    Mode: VariableName
    Event: VariableName
    Callback: VariableName
    Skeduler: VariableName
    create: VariableName
    wait: VariableName
    waitFuture: VariableName
    subscribe: VariableName
    emit: VariableName
    cancel: VariableName
}

interface SkedNamespacePrivate {
    _Request: VariableName
    _ID_COUNTER_INIT: VariableName
    _MODE_WAIT: VariableName
    _MODE_SUBSCRIBE: VariableName
    _createRequest: VariableName
    _nextId: VariableName
}

export type SkedNamespaceAll = SkedNamespacePublic & SkedNamespacePrivate
