import typescript from '@rollup/plugin-typescript'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default [
    {
        input: './src/engine-assemblyscript/asc-wasm-bindings.ts',
        output: {
            file: './dist/asc-wasm-bindings.iife.js',
            sourcemap: true,
            format: 'iife',
            name: 'AscWasmBindings',
        },
        plugins: [
            typescript({ tsconfig: 'tsconfig-asc-wasm-bindings.json' }),
            nodeResolve(),
            commonjs(),
        ],
    }
]
