import { AstContent, AstElement, Code, CodeVariableName } from './types'
import {
    TypeName,
    VarDeclaration,
    ConstVarDeclaration,
    AstContainer,
    FuncDeclaration,
    ClassDeclaration,
} from './types'

type AstContentRaw = AstContent | AstContainer | null | number

type AstContentNested = Array<AstContentNested | AstContentRaw>

export const Var = (
    typeName: TypeName,
    name: CodeVariableName,
    value?: Code | AstContainer
): VarDeclaration => _preventToString({
    astType: 'Var',
    name,
    type: typeName,
    value: typeof value === 'string' ? AstRaw([value]): value,
})

export const ConstVar = (
    typeName: TypeName,
    name: CodeVariableName,
    value?: Code | AstContainer
): ConstVarDeclaration => _preventToString({
    astType: 'ConstVar',
    name,
    type: typeName,
    value: typeof value === 'string' ? AstRaw([value]): value,
})

export const Func =
    (name: string, args: Array<VarDeclaration>, returnType: Code) =>
    (
        strings: ReadonlyArray<Code>,
        ...content: AstContentNested
    ): FuncDeclaration => _preventToString({
        astType: 'Func',
        name,
        args,
        returnType,
        body: Ast(strings, ...content),
    })

export const Class = (
    name: string,
    members: Array<VarDeclaration>
): ClassDeclaration => _preventToString({
    astType: 'Class',
    name,
    members,
})

export const Ast = (
    strings: ReadonlyArray<Code>,
    ...content: AstContentNested
): AstContainer => {
    let combinedContent: Array<AstContent> = []

    // TODO : why not using _combineStrings ?
    let currentString = ''
    for (let i = 0; i < strings.length; i++) {
        currentString += strings[i]
        if (i >= content.length) {
            combinedContent.push(currentString)
            break
        }
        const element = content[i]

        if (typeof element === 'string') {
            currentString += element
        } else if (typeof element === 'number') {
            currentString += element.toString()
        } else {
            combinedContent.push(currentString)
            currentString = ''

            if (Array.isArray(element)) {
                combinedContent = [
                    ...combinedContent,
                    ..._flattenAndFilter(element),
                ]
            } else if (
                typeof element === 'object' &&
                element.astType === 'Container'
            ) {
                combinedContent = [...combinedContent, ...element.content]
            
            } else if (element === null) {
                // Do nothing
            } else {
                combinedContent.push(element)
            }
        }
    }

    return _preventToString({
        astType: 'Container',
        content: combinedContent,
    })
}

export const AstRaw = (content: AstContentNested): AstContainer => ({
    astType: 'Container',
    content: _combineStrings(_flattenAndFilter(content)),
})

const _flattenAndFilter = (content: AstContentNested): Array<AstContent> => {
    // 1. flatten arrays
    // Problem with TS and Array.flat(Infinity) :
    // REF : https://stackoverflow.com/a/61420611/312598
    const flattened = (
        content.flat(Infinity as 1) as Array<AstContentRaw>
    )
        // 2. remove nulls
        .filter((element) => element !== null)
        .map(element => typeof element === 'number' ? element.toString() : element)
        // 3. flatten AstContainer
        .flatMap((element) =>
            typeof element === 'object' && element.astType === 'Container'
                ? element.content
                : [element]
        )
    // 4. add newlines between elements
    return flattened.flatMap((element, i) =>
        i < flattened.length - 1 ? [element, '\n'] : [element]
    )
}

const _combineStrings = (content: Array<AstContent>) => {
    let combinedContent: Array<AstContent> = []
    let currentString = ''
    for (let i = 0; i < content.length; i++) {
        if (typeof content[i] === 'string') {
            currentString += content[i]
        } else {
            combinedContent.push(currentString)
            currentString = ''
            combinedContent.push(content[i])
        }
    }
    if (currentString.length) {
        combinedContent.push(currentString)
    }
    return combinedContent.filter((element) =>
        typeof element === 'string' ? element.length > 0 : true
    )
}

const _preventToString = <T extends AstElement>(element : T): T => ({
    ...element,
    // toString: () => { 
    //     throw new Error(`Rendering element ${element.astType} as string is probably an error`) 
    // }
})