import { VariableName } from '../../ast/types'
import {
    FloatArrayPointer,
    InternalPointer,
} from '../../engine-assemblyscript/run/types'

export interface CoreExportsAssemblyScript {
    createFloatArray: (length: number) => FloatArrayPointer
    x_createListOfArrays: () => InternalPointer
    x_pushToListOfArrays: (
        arrays: InternalPointer,
        array: FloatArrayPointer
    ) => void
    x_getListOfArraysLength: (listOfArraysPointer: InternalPointer) => number
    x_getListOfArraysElem: (
        listOfArraysPointer: InternalPointer,
        index: number
    ) => number
    // Pointers to input and output buffers
    x_getOutput: () => FloatArrayPointer
    x_getInput: () => FloatArrayPointer
}

export interface CoreNamespacePublic {
    IT_FRAME: VariableName
    FRAME: VariableName
    BLOCK_SIZE: VariableName
    SAMPLE_RATE: VariableName
    NULL_SIGNAL: VariableName
    INPUT: VariableName
    OUTPUT: VariableName
    toInt: VariableName
    toFloat: VariableName
    createFloatArray: VariableName
    setFloatDataView: VariableName
    getFloatDataView: VariableName
}

export type CoreNamespaceAll = CoreNamespacePublic &
    Record<keyof CoreExportsAssemblyScript, VariableName>
