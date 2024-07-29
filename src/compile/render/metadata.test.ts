import assert from 'assert'
import {
    makePrecompilation,
    precompilationToRenderInput,
} from '../test-helpers'
import { buildMetadata } from './metadata'
import { Func } from '../../ast/declare'

describe('metadata', () => {
    describe('buildMetadata', () => {
        it('should filter exported and imported functions from compilation object and add them to variableNamesIndex', () => {
            const precompilation = makePrecompilation({})
            precompilation.variableNamesIndex.globalCode.bla = {
                hello: 'bla_hello',
                bye: 'bla_bye',
                blah: 'bla_blah',
            }
            precompilation.variableNamesIndex.globalCode.blo = {
                good: 'blo_good',
                blurg: 'blo_blurg',
            }
            precompilation.precompiledCode.dependencies.exports = [
                'bla_hello',
                'blo_good',
            ]
            precompilation.precompiledCode.dependencies.imports = [
                Func('bla_blah')``,
                Func('blo_blurg')``,
            ]
            const renderInput = precompilationToRenderInput(
                precompilation
            )
            const metadata = buildMetadata(renderInput)

            assert.deepStrictEqual(
                metadata.compilation.variableNamesIndex.globalCode,
                {
                    bla: {
                        hello: 'bla_hello',
                        blah: 'bla_blah',
                    },
                    blo: {
                        good: 'blo_good',
                        blurg: 'blo_blurg',
                    },
                }
            )
        })
    })
})
