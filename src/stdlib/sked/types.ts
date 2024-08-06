import { VariableName } from "../../ast/types"

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