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

import { AudioSettings, CompilerTarget, RawModule, SharedCodeGenerator } from '../types'
import { getMacros } from '../compile'
import { renderCode } from '../functional-helpers'
import { createTestModule } from '../test-helpers'

interface TestParameters {
    bitDepth: AudioSettings['bitDepth']
    target: CompilerTarget
}

export const TEST_PARAMETERS: Array<TestParameters> = [
    { bitDepth: 32, target: 'javascript' },
    // { bitDepth: 64, target: 'javascript' },
    { bitDepth: 32, target: 'assemblyscript' },
    // { bitDepth: 64, target: 'assemblyscript' },
]

export const attachBindings = (
    rawNodule: RawModule,
    bindings: { [key: string]: any }
) => {
    return new Proxy(rawNodule, {
        get: (target, key) => {
            if (bindings.hasOwnProperty(key)) {
                return bindings[key as string]
            }
            return (target as any)[key]
        },
    })
}

export const runTestSuite = (
    tests: Array<{ description: string; codeGenerator: SharedCodeGenerator }>,
    sharedCode: Array<SharedCodeGenerator> = []
) => {
    const testModules: Array<[TestParameters, any]> = []
    let testCounter = 1
    const testFunctionNames: Array<string> = []

    tests.forEach(() => testFunctionNames.push(`test${testCounter++}`))

    beforeAll(async () => {
        for (let testParameters of TEST_PARAMETERS) {
            const macros = getMacros(testParameters.target)
            const { Var, Func } = macros
            const codeGeneratorContext = {
                macros,
                target: testParameters.target,
                audioSettings: {
                    bitDepth: testParameters.bitDepth,
                    channelCount: { in: 2, out: 2 },
                },
            }
            let code = renderCode`
                ${sharedCode.map((codeGenerator) =>
                    codeGenerator(codeGeneratorContext)
                )}

                function reportTestFailure ${Func(
                    [Var('msg', 'string')],
                    'void'
                )} {
                    console.log(msg)
                    throw new Error('test failed')
                }                

                function assert_stringsEqual ${Func(
                    [Var('actual', 'string'), Var('expected', 'string')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got string "' + actual 
                            + '" expected "' + expected + '"')
                    }
                }

                function assert_booleansEqual ${Func(
                    [Var('actual', 'boolean'), Var('expected', 'boolean')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got boolean ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                }

                function assert_integersEqual ${Func(
                    [Var('actual', 'Int'), Var('expected', 'Int')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got integer ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                }
    
                function assert_floatsEqual ${Func(
                    [Var('actual', 'Float'), Var('expected', 'Float')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got float ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                }

                function assert_floatArraysEqual ${Func(
                    [
                        Var('actual', 'FloatArray'),
                        Var('expected', 'FloatArray'),
                    ],
                    'void'
                )} {
                    if (actual.length !== expected.length) {
                        reportTestFailure(
                            'Arrays of different length ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                    for (let ${Var('i', 'Int')} = 0; i < actual.length; i++) {
                        if (actual[i] !== expected[i]) {
                            reportTestFailure(
                                'Arrays are not equal ' + actual.toString() 
                                + ' expected ' + expected.toString())
                        }
                    }
                }

                ${tests.map(
                    ({ codeGenerator }, i) => `
                    function ${testFunctionNames[i]} ${Func([], 'void')} {
                        ${codeGenerator(codeGeneratorContext)}
                    }
                `
                )}

                ${
                    testParameters.target === 'assemblyscript'
                        ? `export {${testFunctionNames.join(',')}}`
                        : `const exports = {${testFunctionNames.join(',')}}`
                }
                
            `

            testModules.push([
                testParameters,
                await createTestModule(
                    testParameters.target,
                    testParameters.bitDepth,
                    code
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
            _findTestModule(testParameters)[testFunctionNames[i]]()
        })
    })
}
