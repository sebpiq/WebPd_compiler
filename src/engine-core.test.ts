import { graphMultipleMessagesPerTick } from '@webpd/engine-live-eval/test-cases'
import compile from './compile'
import NODE_IMPLEMENTATIONS from './nodes'
import {
    CodeGeneratorSettings,
    CompilerSettings,
    NodeImplementations,
    PortsNames,
    VariableNameGenerators,
} from './types'
import { generateInletVariableName } from './variable-names'

describe.skip('engine-live-eval.test', () => {
    const ENGINE_SETTINGS: PdEngine.Settings = {
        sampleRate: 44100,
        channelCount: 2,
    }

    const COMPILER_SETTINGS: CompilerSettings = {
        ...ENGINE_SETTINGS,
        arraysVariableName: 'ARRAYS',
    }

    const CODE_GENERATOR_SETTINGS: CodeGeneratorSettings = {
        ...ENGINE_SETTINGS,
        variableNames: {
            output: ['ENGINE_OUTPUT1', 'ENGINE_OUTPUT2'],
            arrays: 'ARRAYS',
        },
    }

    it('should send multiple messages per tick', async () => {
        const nodeImplementations: NodeImplementations = {
            ...NODE_IMPLEMENTATIONS,
            print: {
                setup: () => ``,
                loop: (_, n) =>
                    `${
                        CODE_GENERATOR_SETTINGS.variableNames.output[0]
                    } = ${n.ins('0')}`,
            },
            trigger: {
                setup: (
                    node: PdDspGraph.Node,
                    n: VariableNameGenerators,
                    settings: CodeGeneratorSettings
                ) => ``,
                loop: (
                    node: PdDspGraph.Node,
                    n: VariableNameGenerators,
                    settings: CodeGeneratorSettings
                ) => `
                    ${n.outs('0')}.push(['bang'])
                    ${n.outs('1')}.push(['bang'])
                    ${n.outs('2')}.push(['bang'])
                `,
            },
            float: {
                setup: (
                    node: PdDspGraph.Node,
                    variableNameGenerators: VariableNameGenerators,
                    settings: CodeGeneratorSettings
                ) => `
                    let ${variableNameGenerators.state('value')} = ${
                    node.args.value
                }
                `,
                loop: (
                    node: PdDspGraph.Node,
                    n: VariableNameGenerators,
                    settings: CodeGeneratorSettings
                ) => `${n.outs('0')}.push([${n.state('value')}])`,
            },
            '+': {
                setup: (
                    node: PdDspGraph.Node,
                    n: VariableNameGenerators,
                    settings: CodeGeneratorSettings
                ) => `
                    let ${n.state('value')} = ${node.args.value}
                `,
                loop: (
                    node: PdDspGraph.Node,
                    n: VariableNameGenerators,
                    settings: CodeGeneratorSettings
                ) => `
                    while (${n.ins('0')}.length) {
                        ${n.outs('0')}.push(${n.ins('0')}.pop())
                    }
                `,
            },
        }
        const compilerSettings = {
            ...COMPILER_SETTINGS,
            channelCount: 1,
        }
        const code = await compile(
            graphMultipleMessagesPerTick.graph,
            nodeImplementations,
            compilerSettings
        )
        const inletVariableName = generateInletVariableName(
            graphMultipleMessagesPerTick.bang[0],
            graphMultipleMessagesPerTick.bang[1]
        )

        const processorFunction = new Function(code)()
        processorFunction.ports[PortsNames.SET_VARIABLE](inletVariableName, [
            ['bang'],
        ])
        console.log(processorFunction.loop()[0])
    })
})
