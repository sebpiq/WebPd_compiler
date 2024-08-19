import { VariableName } from '../../ast/types'

export interface BufNamespacePublic {
    SoundBuffer: VariableName
    clear: VariableName
    create: VariableName
    pushBlock: VariableName
    pullSample: VariableName
    writeSample: VariableName
    readSample: VariableName
}

export type BufNamespaceAll = BufNamespacePublic
