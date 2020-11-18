import { EngineAttributes, EvalDspLoop, EvalDspSetup } from "@webpd/engine-core/src/types"

export interface JsEvalEngineAttributes extends EngineAttributes {
    engineOutputVariableNames: Array<string>
}

type GlobalVariableName = string

type GlobalNameBuilder = (localVariableName: string) => GlobalVariableName

export interface GlobalNameBuilders {
    state: GlobalNameBuilder
    ins: GlobalNameBuilder
    outs: GlobalNameBuilder
}

export type NodeSetup = (
    node: PdDspGraph.Node, 
    nameBuilders: GlobalNameBuilders, 
    settings: JsEvalEngineAttributes) => EvalDspSetup

export type NodeLoop = (
    node: PdDspGraph.Node, 
    nameBuilders: GlobalNameBuilders, 
    settings: JsEvalEngineAttributes) => EvalDspLoop

export interface NodeImplementation {
    setup: NodeSetup
    loop: NodeLoop
}