import { EngineAttributes, EvalDspLoop, EvalDspSetup } from "@webpd/engine-core"

type GlobalVariableName = string

export type NodeStateDeclaration = {[unprefiedAttrName: string]: string}

export type NodeStateVariableNames = {[unprefixedAttrName: string]: GlobalVariableName}

export interface NodeVariableNames<VariableNames extends NodeStateVariableNames> {
    state: VariableNames
    ins: Array<GlobalVariableName>
    outs: Array<GlobalVariableName>
}

export type NodeDeclareState = (node: PdDspGraph.Node) => NodeStateDeclaration

export type NodeSetup<StateVariableNames extends NodeStateVariableNames> = (
    node: PdDspGraph.Node, 
    nodeVariableNames: NodeVariableNames<StateVariableNames>, 
    settings: EngineAttributes) => EvalDspSetup

export type NodeLoop<StateVariableNames extends NodeStateVariableNames> = (
    node: PdDspGraph.Node, nodeVariableNames: NodeVariableNames<StateVariableNames>, 
    settings: EngineAttributes) => EvalDspLoop

export interface NodeImplementation {
    declareState: NodeDeclareState
    setup: NodeSetup<NodeStateVariableNames>
    loop: NodeLoop<NodeStateVariableNames>
}