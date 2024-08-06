import { VariableName } from '../../ast/types'
import {
    StringPointer,
    FloatArrayPointer,
} from '../../engine-assemblyscript/run/types'
import { FloatArray } from '../../run/types'

export interface CommonsApi {
    getArray: (arrayName: string) => FloatArray
    setArray: (arrayName: string, array: FloatArray | Array<number>) => void
}

export interface CommonsExportsAssemblyScript {
    getArray: (arrayName: StringPointer) => FloatArrayPointer
    setArray: (arrayName: StringPointer, array: FloatArrayPointer) => void
}

export type CommonsExportsJavaScript = CommonsApi

export interface CommonsNamespacePublic {
    waitFrame: VariableName
    cancelWaitFrame: VariableName
    getArray: VariableName
    setArray: VariableName
    hasArray: VariableName
    subscribeArrayChanges: VariableName
    cancelArrayChangesSubscription: VariableName
}

export interface CommonsNamespacePrivate {
    _ARRAYS: VariableName
    _ARRAYS_SKEDULER: VariableName
    _FRAME_SKEDULER: VariableName
    _emitFrame: VariableName
}

export type CommonsNamespaceAll = CommonsNamespacePublic &
    CommonsNamespacePrivate &
    Record<keyof CommonsExportsAssemblyScript, VariableName>
