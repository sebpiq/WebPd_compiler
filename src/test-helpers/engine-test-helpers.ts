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
    GlobalDefinitions,
    CompilationSettings,
    VariableNamesIndex,
} from '../compile/types'
import { AstSequence, Code, AstFunc, VariableName } from '../ast/types'
import { ast, Sequence, Func, Var } from '../ast/declare'
import { BindingSpec, Engine } from '../run/types'
import { writeFile } from 'fs/promises'
import { getMacros } from '../compile/compile-helpers'
import {
    compileAssemblyscript,
    wasmBufferToRawModule,
} from '../engine-assemblyscript/run/test-helpers'
import { mapArray, renderSwitch } from '../functional-helpers'
import { compileRawModule } from '../engine-javascript/run'
import render from '../compile/render'
import {
    collectAndDedupeExports,
    flattenDependencies,
    instantiateAndDedupeDependencies,
} from '../compile/precompile/dependencies'
import {
    makePrecompilation,
} from '../compile/test-helpers'
import { createEngine as createJavaScriptEngine } from '../engine-javascript/run'
import { createEngine as createAssemblyScriptWasmEngine } from '../engine-assemblyscript/run'

interface TestParameters {
    bitDepth: AudioSettings['bitDepth']
    target: CompilerTarget
}

type Module = object

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
    assemblyscript: (buffer: ArrayBuffer) => Promise<Module>
    javascript: (code: Code) => Promise<Module>
}

/** Helper function to create a `Module` for running tests. */
export const createTestModule = async (
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    applyBindings: CreateTestModuleApplyBindings
) => {
    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${target === 'javascript' ? 'js' : 'as'}`,
        code
    )
    switch (target) {
        case 'javascript':
            const jsModule = await applyBindings.javascript(code)
            return jsModule
        case 'assemblyscript':
            const buffer = await compileAssemblyscript(code, bitDepth)
            const ascModule = await applyBindings.assemblyscript(buffer)
            return ascModule
    }
}

// Set default type to 'UNKNOWN' otherwise default type is `string` which
// is too permissive, showing any string key as available on the engine.
export const createTestEngine = <ExportedKeys extends string = 'UNKNOWN'>(
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    dependencies: Array<GlobalDefinitions> = []
) => {
    const precompilation = makePrecompilation({
        settings: {
            target,
            audio: {
                bitDepth,
                channelCount: { in: 2, out: 2 },
            },
        },
    })
    const globals = precompilation.variableNamesReadOnly.globals
    const settings = precompilation.settings
    const exports = collectAndDedupeExports(
        flattenDependencies(dependencies),
        precompilation.variableNamesAssigner,
        globals, settings
    )
    // Create modules with bindings containing not only the basic bindings but also raw bindings
    // for all functions exported in `dependencies`
    return createTestModule(target, bitDepth, code, {
        javascript: async (code: Code) =>
            createJavaScriptEngine(
                code,
                mapArray(exports, (name) => [
                    String(name),
                    { type: 'raw' } as BindingSpec<any>,
                ])
            ),
        assemblyscript: async (buffer) =>
            createAssemblyScriptWasmEngine(
                buffer,
                mapArray(exports, (name) => [
                    String(name),
                    { type: 'raw' } as BindingSpec<any>,
                ])
            ),
    }) as Promise<Engine & Record<ExportedKeys, any>>
}

export const runTestSuite = (
    tests: Array<{
        description: string
        testFunction: ({
            target,
            globals,
        }: {
            target: CompilerTarget
            globals: VariableNamesIndex['globals']
        }) => AstFunc
    }>,
    dependencies: Array<GlobalDefinitions> = [],
    partialSettings: Partial<CompilationSettings> = {}
) => {
    const testModules: Array<[TestParameters, Module]> = []
    let testCounter = 1
    const testFunctionNames = tests.map(() => `test${testCounter++}`)

    beforeAll(async () => {
        for (let testParameters of TEST_PARAMETERS) {
            const { target, bitDepth } = testParameters
            const precompilation = makePrecompilation({
                settings: {
                    ...partialSettings,
                    audio: {
                        bitDepth,
                        channelCount: { in: 2, out: 2 },
                    },
                    target,
                },
            })
            const globals = precompilation.variableNamesReadOnly.globals
            const settings = precompilation.settings
            const testsCodeDefinitions: Array<GlobalDefinitions> =
                tests.map<GlobalDefinitions>(({ testFunction }, i) => {
                    const astTestFunc = testFunction({
                        target,
                        globals: precompilation.variableNamesAssigner.globals,
                    })
                    const codeGeneratorWithSettings: GlobalDefinitions = {
                        namespace: 'tests',
                        code: () => ({
                            ...astTestFunc,
                            name: testFunctionNames[i]!,
                        }),
                        exports: () => [testFunctionNames[i]!],
                    }
                    return codeGeneratorWithSettings
                })

            // prettier-ignore
            const testsAndDependencies = Sequence([
                Func('reportTestFailure', [Var(`string`, `msg`)], `void`)`
                    console.log(msg)
                    throw new Error('test failed')
                `,
                Func(
                    'assert_stringsEqual',
                    [Var(`string`, `actual`), Var(`string`, `expected`)],
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
                    [Var(`boolean`, `actual`), Var(`boolean`, `expected`)],
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
                    [Var(`Int`, `actual`), Var(`Int`, `expected`)],
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
                    [Var(`Float`, `actual`), Var(`Float`, `expected`)],
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
                        Var(`FloatArray`, `actual`),
                        Var(`FloatArray`, `expected`),
                    ],
                    'void'
                )`
                    if (actual.length !== expected.length) {
                        reportTestFailure(
                            'Arrays of different length ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                    for (${Var(`Int`, `i`, `0`)}; i < actual.length; i++) {
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
                    globals, 
                    settings
                ),

                target === 'javascript' ? 'const exports = {}' : null,

                generateTestExports(
                    target,
                    collectAndDedupeExports(
                        [...dependencies, ...testsCodeDefinitions],
                        precompilation.variableNamesAssigner,
                        globals, settings
                    )
                ),
            ])

            testModules.push([
                testParameters,
                await createTestModule(
                    target,
                    bitDepth,
                    render(getMacros(target), testsAndDependencies),
                    {
                        javascript: async (code) => compileRawModule(code),
                        assemblyscript: (buffer) =>
                            wasmBufferToRawModule(buffer),
                    }
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
