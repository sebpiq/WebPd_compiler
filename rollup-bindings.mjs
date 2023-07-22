import typescript from '@rollup/plugin-typescript'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default [
    {
        input: './src/engine-assemblyscript/bindings/index.ts',
        output: {
            file: './dist/assemblyscript-wasm-bindings.iife.js',
            sourcemap: true,
            format: 'iife',
            name: 'AssemblyScriptWasmBindings',
        },
        plugins: [
            typescript({
                tsconfig: 'tsconfig-bindings.json',
            }),
            nodeResolve(),
            commonjs(),
        ],
    },
    {
        input: './src/engine-javascript/bindings.ts',
        output: {
            file: './dist/javascript-bindings.iife.js',
            sourcemap: true,
            format: 'iife',
            name: 'JavaScriptBindings',
        },
        plugins: [
            typescript({
                tsconfig: 'tsconfig-bindings.json',
            }),
            nodeResolve(),
            commonjs(),
        ],
    },
]
