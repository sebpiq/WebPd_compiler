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
    GlobalCodeDefinition,
    GlobalCodeDefinitionExport,
    GlobalCodeGeneratorWithSettings,
} from './compile/types'
import { AstSequence, Code, AstFunc } from './ast/types'
import { ast, Sequence, Func, Var } from './ast/declare'
import { Engine, Module, RawModule } from './run/types'
import { writeFile } from 'fs/promises'
import { getMacros } from './compile/compile-helpers'
import { jsCodeToRawModule } from './engine-javascript/run/test-helpers'
import {
    compileAssemblyscript,
    wasmBufferToRawModule,
} from './engine-assemblyscript/run/test-helpers'
import { mapArray, renderSwitch } from './functional-helpers'
import {
    createRawModule as createAssemblyScriptWasmRawModule,
    createBindings as createAssemblyScriptWasmEngineBindings,
} from './engine-assemblyscript/run'
import {
    RawJavaScriptEngine,
    createBindings as createJavaScriptEngineBindings,
} from './engine-javascript/run'
import { createModule } from './run/run-helpers'
import render from './compile/render'
import {
    collectAndDedupeExports,
    flattenDependencies,
    instantiateAndDedupeDependencies,
} from './compile/precompile/dependencies'
import { createVariableNamesIndex } from './compile/precompile/variable-names-index'
import { makeSettings } from './compile/test-helpers'

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
    javascript?: (rawModule: RawModule) => Promise<Module>
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
            const rawModule = await jsCodeToRawModule(code)
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
    dependencies: Array<GlobalCodeDefinition> = []
) => {
    const exports = collectAndDedupeExports(
        target,
        flattenDependencies(dependencies)
    )
    // Create modules with bindings containing not only the basic bindings but also raw bindings
    // for all functions exported in `dependencies`
    return createTestModule<TestEngine<ExportsKeys>>(target, bitDepth, code, {
        javascript: async (rawModule) => {
            return createModule(rawModule, {
                ...mapArray(exports, ({ name }) => [
                    String(name),
                    { type: 'raw' },
                ]),
                ...createJavaScriptEngineBindings(rawModule as RawJavaScriptEngine),
            })
        },
        assemblyscript: async (buffer) => {
            const { rawModule, engineData, forwardReferences } =
                await createAssemblyScriptWasmRawModule(buffer)
            const engineBindings = await createAssemblyScriptWasmEngineBindings(
                rawModule,
                engineData,
                forwardReferences
            )
            return createModule(rawModule, {
                ...mapArray(exports, ({ name }) => [
                    String(name),
                    { type: 'raw' },
                ]),
                ...engineBindings,
            })
        },
    })
}

export const runTestSuite = (
    tests: Array<{
        description: string
        testFunction: (target: CompilerTarget) => AstFunc
    }>,
    dependencies: Array<GlobalCodeDefinition> = []
) => {
    const testModules: Array<[TestParameters, Module]> = []
    let testCounter = 1
    const testFunctionNames = tests.map(() => `test${testCounter++}`)

    beforeAll(async () => {
        for (let testParameters of TEST_PARAMETERS) {
            const { target, bitDepth } = testParameters
            const settings = makeSettings({
                audio: {
                    bitDepth,
                    channelCount: { in: 2, out: 2 },
                },
                target,
            })
            const testsCodeDefinitions: Array<GlobalCodeGeneratorWithSettings> =
                tests.map<GlobalCodeGeneratorWithSettings>(({ testFunction }, i) => {
                    const astTestFunc = testFunction(target)
                    const codeGeneratorWithSettings: GlobalCodeGeneratorWithSettings = {
                        codeGenerator: () => ({
                            ...astTestFunc,
                            name: testFunctionNames[i]!,
                        }),
                        exports: [{ name: testFunctionNames[i]! }],
                    }
                    return codeGeneratorWithSettings
                })

            let sequence = Sequence([
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
                    settings,
                    flattenDependencies([
                        ...dependencies,
                        ...testsCodeDefinitions,
                    ]),
                    createVariableNamesIndex().globs
                ),

                target === 'javascript' ? 'const exports = {}' : null,

                generateTestExports(
                    target,
                    collectAndDedupeExports(target, [
                        ...dependencies,
                        ...testsCodeDefinitions,
                    ])
                ),
            ])

            testModules.push([
                testParameters,
                await createTestModule(
                    target,
                    bitDepth,
                    render(getMacros(target), sequence)
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
    exports: Array<GlobalCodeDefinitionExport>
): AstSequence =>
    ast`${renderSwitch(
        [
            target === 'assemblyscript',
            exports.map(({ name }) => `export { ${name} }`),
        ],
        [
            target === 'javascript',
            exports.map(({ name }) => `exports.${name} = ${name}`),
        ]
    )}`
