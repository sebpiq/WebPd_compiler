import { initializePrecompiledCode } from '.'
import { validateSettings } from '..'
import { buildFullGraphTraversal } from '../compile-helpers'
import { PrecompilationInput, PrecompilationOperation } from './types'

export type TestingPrecompilationInput = Partial<{
    [property in keyof PrecompilationInput]: Partial<
        PrecompilationInput[property]
    >
}>

export const makePrecompilation = (
    testingInput: TestingPrecompilationInput
): PrecompilationOperation => {
    const target = (testingInput.settings || {}).target || 'javascript'
    const settings = validateSettings(
        testingInput.settings || {},
        target
    )
    const nodeImplementations = testingInput.nodeImplementations || {
        DUMMY: {},
    }
    const graph = testingInput.graph || {}
    const input: PrecompilationInput = {
        settings,
        graph,
        nodeImplementations,
    }
    const output = initializePrecompiledCode(
        input,
        buildFullGraphTraversal(graph, settings)
    )
    return {
        input,
        output,
    }
}
