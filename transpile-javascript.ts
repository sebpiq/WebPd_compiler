import ts from 'typescript'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
const { transpileModule } = ts

const _getAscModulePath = (name: string) =>
    path.resolve('src', 'core-code', `${name}.asc`)

const _getJsModulePath = (name: string) =>
    path.resolve(
        'src',
        'core-code',
        `${name}.generated.js.txt`
    )

const TRANSPILATION_SETTINGS: ts.TranspileOptions = {
    compilerOptions: {
        target: ts.ScriptTarget.ES2021,
        module: ts.ModuleKind.None,
    },
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const FS_ASC = readFileSync(_getAscModulePath('fs')).toString('utf8')
    const COMMONS_ASC = readFileSync(_getAscModulePath('commons')).toString(
        'utf8'
    )
    const BUF_ASC = readFileSync(_getAscModulePath('buf')).toString('utf8')
    const SKED_ASC = readFileSync(_getAscModulePath('sked')).toString('utf8')

    for (let [filepath, ascCode] of [
        [_getJsModulePath('buf'), BUF_ASC],
        [_getJsModulePath('commons'), COMMONS_ASC],
        [_getJsModulePath('sked'), SKED_ASC],
    ]) {
        const { outputText: jsCode } = transpileModule(
            ascCode,
            TRANSPILATION_SETTINGS
        )
        writeFileSync(filepath, jsCode)
        console.log(`> ${filepath} WRITTEN !`)
    }
}
