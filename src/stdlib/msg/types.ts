import { VariableName } from "../../ast/types"
import { ArrayBufferOfIntegersPointer, MessagePointer, FloatArrayPointer, StringPointer } from "../../engine-assemblyscript/run/types"

export interface MsgExportsAssemblyScript {
    FLOAT_TOKEN: WebAssembly.Global
    STRING_TOKEN: WebAssembly.Global

    x_create: (
        templatePointer: ArrayBufferOfIntegersPointer
    ) => MessagePointer
    x_getTokenTypes: (
        messagePointer: MessagePointer
    ) => FloatArrayPointer
    x_createTemplate: (length: number) => FloatArrayPointer

    writeStringToken: (
        messagePointer: MessagePointer,
        tokenIndex: number,
        stringPointer: StringPointer
    ) => void
    writeFloatToken: (
        messagePointer: MessagePointer,
        tokenIndex: number,
        value: number
    ) => void
    readStringToken: (
        messagePointer: MessagePointer,
        tokenIndex: number
    ) => StringPointer
    readFloatToken: (
        messagePointer: MessagePointer,
        tokenIndex: number
    ) => number
}

export interface MsgNamespacePublic {
    FLOAT_TOKEN: VariableName
    STRING_TOKEN: VariableName
    readStringToken: VariableName
    readFloatToken: VariableName
    writeFloatToken: VariableName
    writeStringToken: VariableName
    create: VariableName
    Handler: VariableName
    Message: VariableName
    getLength: VariableName
    getTokenType: VariableName
    isStringToken: VariableName
    isFloatToken: VariableName
    isMatching: VariableName
    floats: VariableName
    strings: VariableName
    display: VariableName
    nullMessageReceiver: VariableName
    emptyMessage: VariableName
}

interface MsgNamespacePrivate {
    _Template: VariableName
    _Header: VariableName
    _HeaderEntry: VariableName
    _FloatToken: VariableName
    _CharToken: VariableName
    _computeHeaderLength: VariableName
    _unpackHeader: VariableName
    _unpackTokenTypes: VariableName
    _unpackTokenPositions: VariableName
}

export type MsgNamespaceAll = MsgNamespacePublic &
    MsgNamespacePrivate &
    Record<keyof MsgExportsAssemblyScript, VariableName>