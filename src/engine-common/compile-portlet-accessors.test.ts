import assert from 'assert'
import { makeGraph } from '../dsp-graph/test-helpers'
import { makeCompilation, normalizeCode } from '../test-helpers'
import { NodeImplementations } from '../types'
import { compileInletCallers } from './compile-portlet-accessors'

describe('compile-portlet-accessors', () => {
    describe('compileInletCallers', () => {
        it('should compile declared inlet callers', () => {
            const graph = makeGraph({
                add: {
                    type: '+',
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                '+': {
                    messages: () => ({
                        '0': '// [+] message receiver',
                    }),
                },
            }

            const compilation = makeCompilation({
                target: 'javascript',
                graph,
                inletCallerSpecs: { add: ['0'] },
                nodeImplementations,
            })

            const declareCode = compileInletCallers(compilation)

            assert.strictEqual(
                normalizeCode(declareCode),
                normalizeCode(`
                    function inletCaller_add_0 (m) {add_RCVS_0(m)}
                `)
            )
        })
    })
})
