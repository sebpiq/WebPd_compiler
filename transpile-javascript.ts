import { Code } from './src/types'
import ts from 'typescript'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const { transpileModule } = ts

const TRANSPILATION_SETTINGS = {}

export const renderJs = (
    jsStrings: Array<string>,
    jsVariablesIndexes: Array<number>,
    ascVariables: Array<string>
): Code => {
    // Filter ascVariables to include only the relevant ones for the JS code
    const jsVariables = jsVariablesIndexes.map((index) => ascVariables[index])

    // Render JS code
    return renderTemplatedCode(jsStrings, ...jsVariables)
}

export const renderTemplatedCode = (
    strings: TemplateStringsArray | Array<string>,
    ...variables: Array<string>
): Code => {
    let code: Code = ''
    strings.forEach((strng, index) => {
        code += strng
        // `variables` length is 1 less than `strings` length.
        if (index < variables.length) {
            code += variables[index]
        }
    })
    return code
}

const transpileAscStrings = (
    ascStrings: Array<string>,
    ascVariables: Array<string>
): [Array<string>, Array<number>] => {
    // 1. First generate assemblyscript code by replacing variables
    // by unique placeholders which can be used afterwards to resplit the code
    const allStrings = ascStrings.join('')
    let placeholders: Array<[number, string]> = []
    let ascWithPlaceholders: string = ''
    let counter = 0

    ascStrings.forEach((ascString, index) => {
        ascWithPlaceholders += ascString
        // `variables` length is 1 less than `strings` length.
        if (index >= ascVariables.length) {
            return false
        }

        // Make sure we pick a placeholder that doesn't already
        // appear in `strings`
        let placeholder = ''
        while (allStrings.includes(placeholder)) {
            placeholder = `__PH${counter++}__`
        }
        placeholders.push([index, placeholder])
        ascWithPlaceholders += placeholder
        return true
    })

    // 2. transpile the code ASC -> JS
    const { outputText: jsWithPlaceholders } = transpileModule(
        ascWithPlaceholders,
        TRANSPILATION_SETTINGS
    )

    // 3. By using the placeholders, we re-split the generated JS code,
    // so that it can be used as a template to generate JS code.
    const jsStrings: Array<string> = []
    const jsVariablesIndexes: Array<number> = []

    // Some placeholders are removed by transpilation.
    // For example : `let a: __PH1` becomes `let a`.
    // We need to ignore these and the `variables` associated with them.
    placeholders = placeholders.filter(([_, placeholder]) =>
        jsWithPlaceholders.includes(placeholder)
    )

    placeholders.reduce(
        (
            jsWithPlaceholders,
            [variableIndex, placeholder],
            placeholderIndex
        ) => {
            const splitted = jsWithPlaceholders.split(placeholder)
            if (splitted.length !== 2) {
                throw new Error('unexpected split output')
            }
            jsStrings.push(splitted[0])
            jsVariablesIndexes.push(variableIndex)
            if (placeholderIndex === placeholders.length - 1) {
                jsStrings.push(splitted[1])
            }
            return splitted[1]
        },
        jsWithPlaceholders
    )

    if (jsStrings.length !== jsVariablesIndexes.length + 1) {
        throw new Error('Unexpected number of variables in transpiled code')
    }

    return [jsStrings, jsVariablesIndexes]
}

const splitAscCode = (ascCode: Code) => {
    const ascStrings: Array<string> = ascCode.split(VARIABLE_REGEX)
    const ascVariables: Array<string> = []
    let match = VARIABLE_REGEX_G.exec(ascCode)
    while (match) {
        ascVariables.push(match[0])
        match = VARIABLE_REGEX_G.exec(ascCode)
    }
    return [ascStrings, ascVariables]
}

const VARIABLE_REGEX = /\${[a-zA-Z0-9_]+}/
const VARIABLE_REGEX_G = new RegExp(VARIABLE_REGEX, 'g')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const FS_ASC = readFileSync(
        './src/engine-assemblyscript/core-code/fs.asc'
    ).toString('utf8')

    for (let [filepath, ascCode] of [
        ['./src/engine-javascript/core-code/fs.generated.js.txt', FS_ASC],
    ]) {
        const [ascStrings, ascVariables] = splitAscCode(ascCode)
        const [jsStrings, jsVariablesIndexes] = transpileAscStrings(
            ascStrings,
            ascVariables
        )
        const jsCode = renderJs(jsStrings, jsVariablesIndexes, ascVariables)
        writeFileSync(filepath, jsCode)
        console.log(`> ${filepath} WRITTEN !`)
    }
}
