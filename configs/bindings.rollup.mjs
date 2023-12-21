import typescript from '@rollup/plugin-typescript'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)))

const PKG_ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.resolve(PKG_ROOT, 'src')
const OUT_DIR = path.resolve(PKG_ROOT, 'dist')
const TS_CONFIG_PATH = path.resolve(PKG_ROOT, 'configs', 'bindings.tsconfig.json')

export default [
    {
        input: path.resolve(SRC_DIR, 'engine-assemblyscript/run/index.ts'),
        output: {
            file: path.resolve(OUT_DIR, 'assemblyscript-wasm-bindings.iife.js'),
            sourcemap: false,
            format: 'iife',
            name: 'AssemblyScriptWasmBindings',
        },
        plugins: [
            typescript({
                tsconfig: TS_CONFIG_PATH,
            }),
            nodeResolve(),
            commonjs(),
        ],
    },
    {
        input: path.resolve(SRC_DIR, 'engine-javascript/run/index.ts'),
        output: {
            file: path.resolve(OUT_DIR, 'javascript-bindings.iife.js'),
            sourcemap: false,
            format: 'iife',
            name: 'JavaScriptBindings',
        },
        plugins: [
            typescript({
                tsconfig: TS_CONFIG_PATH,
            }),
            nodeResolve(),
            commonjs(),
        ],
    },
]
