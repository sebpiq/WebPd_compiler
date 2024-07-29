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

import {
    AudioSettings,
    CompilerTarget,
    GlobalsDefinitions,
    GlobalCodePrecompilationContext,
    CompilationSettings,
} from './compile/types'
import { AstSequence, Code, AstFunc, VariableName } from './ast/types'
import { ast, Sequence, Func, Var } from './ast/declare'
import { Engine, Module } from './run/types'
import { writeFile } from 'fs/promises'
import { getMacros } from './compile/compile-helpers'
import { compileJavascript } from './engine-javascript/run/test-helpers'
import {
    compileAssemblyscript,
    wasmBufferToRawModule,
} from './engine-assemblyscript/run/test-helpers'
import { mapArray, renderSwitch } from './functional-helpers'
import {
    createRawModule as createAssemblyScriptWasmRawModule,
    createEngineBindings as createAssemblyScriptWasmEngineBindings,
    assignReferences,
} from './engine-assemblyscript/run'
import {
    createEngineBindings as createJavaScriptEngineBindings,
    applyNameMappingToRawModule,
    EngineLifecycleRawModule,
} from './engine-javascript/run'
import { attachBindings, RawModuleWithNameMapping } from './run/run-helpers'
import render from './compile/render'
import {
    collectAndDedupeExports,
    flattenDependencies,
    instantiateAndDedupeDependencies,
} from './compile/precompile/dependencies'
import {
    makeGlobalCodePrecompilationContext,
    makePrecompilation,
} from './compile/test-helpers'
import { EngineRawModule } from './engine-assemblyscript/run/types'

interface TestParameters {
    bitDepth: AudioSettings['bitDepth']
    target: CompilerTarget
}

export const TEST_PARAMETERS: Array<TestParameters> = [
    { bitDepth: 32, target: 'javascript' },
    { bitDepth: 64, target: 'javascript' },
    { bitDepth: 32, target: 'assemblyscript' },
    { bitDepth: 64, target: 'assemblyscript' },
]

export const round = (v: number, decimals: number = 4) => {
    // Useful to round big numbers in scientific notation, e.g. 3.282417323806467e+38
    if (v > 1000000) {
        return +v.toPrecision(decimals)
    }
    const rounded =
        Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)
    // Useful to normalise -0 / 0 which compare as different.
    if (rounded === 0) {
        return 0
    }
    return rounded
}

interface CreateTestModuleApplyBindings {
    assemblyscript?: (buffer: ArrayBuffer) => Promise<Module>
    javascript?: (rawModule: EngineLifecycleRawModule) => Promise<Module>
}

/** Helper function to create a `Module` for running tests. */
export const createTestModule = async <ModuleType extends Module>(
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    applyBindings: CreateTestModuleApplyBindings = {}
): Promise<ModuleType> => {
    const applyBindingsNonNull: Required<CreateTestModuleApplyBindings> = {
        javascript: async (rawModule) => rawModule,
        assemblyscript: (buffer) => wasmBufferToRawModule(buffer),
        ...applyBindings,
    }

    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${target === 'javascript' ? 'js' : 'as'}`,
        code
    )
    switch (target) {
        case 'javascript':
            const rawModule = await compileJavascript(code)
            const jsModule = await applyBindingsNonNull.javascript(rawModule)
            return jsModule as ModuleType
        case 'assemblyscript':
            const buffer = await compileAssemblyscript(code, bitDepth)
            const ascModule = await applyBindingsNonNull.assemblyscript(buffer)
            return ascModule as ModuleType
    }
}

type TestEngine<ExportsKeys> = Engine & {
    [Property in keyof ExportsKeys]: any
}

type TestEngineExportsKeys = { [name: string]: any }

export const createTestEngine = <ExportsKeys extends TestEngineExportsKeys>(
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    dependencies: Array<GlobalsDefinitions> = []
) => {
    const precompilation = makePrecompilation({
        settings: {
            target,
            audio: {
                bitDepth,
                channelCount: { in: 2, out: 2 },
            }
        }
    })
    const context = makeGlobalCodePrecompilationContext(precompilation)
    const exports = collectAndDedupeExports(
        flattenDependencies(dependencies),
        precompilation.variableNamesAssigner,
        context,
    )
    // Create modules with bindings containing not only the basic bindings but also raw bindings
    // for all functions exported in `dependencies`
    return createTestModule<TestEngine<ExportsKeys>>(target, bitDepth, code, {
        javascript: async (rawModule: EngineLifecycleRawModule) => {
            const rawModuleWithMapping = applyNameMappingToRawModule(rawModule)
            return attachBindings(rawModule, {
                ...mapArray(exports, (name) => [String(name), { type: 'raw' }]),
                ...createJavaScriptEngineBindings(
                    rawModuleWithMapping
                ),
            })
        },
        assemblyscript: async (buffer) => {
            const { rawModule, engineData, forwardReferences } =
                await createAssemblyScriptWasmRawModule(buffer)
            const rawModuleWithNameMapping = RawModuleWithNameMapping<EngineRawModule>(
                rawModule,
                engineData.metadata.compilation.variableNamesIndex.globalCode
            )
            const engineBindings = await createAssemblyScriptWasmEngineBindings(
                rawModuleWithNameMapping,
                engineData,
            )
            const engine = attachBindings(rawModuleWithNameMapping, {
                ...mapArray(exports, (name) => [String(name), { type: 'raw' }]),
                ...engineBindings,
            })
            assignReferences(forwardReferences, rawModuleWithNameMapping, engine)
            return engine
        },
    })
}

export const runTestSuite = (
    tests: Array<{
        description: string
        testFunction: ({
            target,
            globalCode,
        }: {
            target: CompilerTarget
            globalCode: GlobalCodePrecompilationContext['globalCode']
        }) => AstFunc
    }>,
    dependencies: Array<GlobalsDefinitions> = [],
    settings: Partial<CompilationSettings> = {},
) => {
    const testModules: Array<[TestParameters, Module]> = []
    let testCounter = 1
    const testFunctionNames = tests.map(() => `test${testCounter++}`)

    beforeAll(async () => {
        for (let testParameters of TEST_PARAMETERS) {
            const { target, bitDepth } = testParameters
            const precompilation = makePrecompilation({
                settings: {
                    ...settings,
                    audio: {
                        bitDepth,
                        channelCount: { in: 2, out: 2 },
                    },
                    target,
                },
            })
            const context = makeGlobalCodePrecompilationContext(precompilation)
            const testsCodeDefinitions: Array<GlobalsDefinitions> =
                tests.map<GlobalsDefinitions>(
                    ({ testFunction }, i) => {
                        const astTestFunc = testFunction({
                            target,
                            globalCode:
                                precompilation.variableNamesAssigner.globalCode,
                        })
                        const codeGeneratorWithSettings: GlobalsDefinitions =
                            {
                                namespace: 'tests',
                                code: () => ({
                                    ...astTestFunc,
                                    name: testFunctionNames[i]!,
                                }),
                                exports: () => [testFunctionNames[i]!],
                            }
                        return codeGeneratorWithSettings
                    }
                )

            const testsAndDependencies = Sequence([
                Func('reportTestFailure', [Var('string', 'msg')], 'void')`
                    console.log(msg)
                    throw new Error('test failed')
                `,
                Func(
                    'assert_stringsEqual',
                    [Var('string', 'actual'), Var('string', 'expected')],
                    'void'
                )`
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got string "' + actual 
                            + '" expected "' + expected + '"')
                    }
                `,
                Func(
                    'assert_booleansEqual',
                    [Var('boolean', 'actual'), Var('boolean', 'expected')],
                    'void'
                )`
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got boolean ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                `,
                Func(
                    'assert_integersEqual',
                    [Var('Int', 'actual'), Var('Int', 'expected')],
                    'void'
                )`
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got integer ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                `,
                Func(
                    'assert_floatsEqual',
                    [Var('Float', 'actual'), Var('Float', 'expected')],
                    'void'
                )`
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got float ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                `,
                Func(
                    'assert_floatArraysEqual',
                    [
                        Var('FloatArray', 'actual'),
                        Var('FloatArray', 'expected'),
                    ],
                    'void'
                )`
                    if (actual.length !== expected.length) {
                        reportTestFailure(
                            'Arrays of different length ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                    for (${Var('Int', 'i', '0')}; i < actual.length; i++) {
                        if (actual[i] !== expected[i]) {
                            reportTestFailure(
                                'Arrays are not equal ' + actual.toString() 
                                + ' expected ' + expected.toString())
                        }
                    }
                `,

                instantiateAndDedupeDependencies(
                    flattenDependencies([
                        ...dependencies,
                        ...testsCodeDefinitions,
                    ]),
                    precompilation.variableNamesAssigner,
                    makeGlobalCodePrecompilationContext(precompilation)
                ),

                target === 'javascript' ? 'const exports = {}' : null,

                generateTestExports(
                    target,
                    collectAndDedupeExports(
                        [...dependencies, ...testsCodeDefinitions],
                        precompilation.variableNamesAssigner,
                        context,
                    )
                ),
            ])

            testModules.push([
                testParameters,
                await createTestModule(
                    target,
                    bitDepth,
                    render(getMacros(target), testsAndDependencies)
                ),
            ])
        }
    })

    const _findTestModule = (testParameters: TestParameters) => {
        const matched = testModules.find(([testModuleParameters]) =>
            Object.entries(testModuleParameters).every(
                ([key, value]) =>
                    testParameters[key as keyof TestParameters] === value
            )
        )
        if (!matched) {
            throw new Error(`Test module for ${testParameters} not found`)
        }
        return matched[1]
    }

    tests.forEach(({ description }, i) => {
        it.each(TEST_PARAMETERS)(description, (testParameters) => {
            ;(_findTestModule(testParameters) as any)[testFunctionNames[i]!]()
        })
    })
}

const generateTestExports = (
    target: CompilerTarget,
    exports: Array<VariableName>
): AstSequence =>
    ast`${renderSwitch(
        [
            target === 'assemblyscript',
            exports.map((name) => `export { ${name} }`),
        ],
        [
            target === 'javascript',
            exports.map((name) => `exports.${name} = ${name}`),
        ]
    )}`
