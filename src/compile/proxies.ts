// TODO : seems to validate pretty much any type. Make more restrictive
// e.g. : add Interface({a:  before any assigner and it seems sill valid.
type _AssignerSpecInterface<T, C> = {
    Interface: { [K in keyof T]: AssignerSpec<T[K], C> }
}
type _AssignerSpecIndex<T, C> = {
    Index: (k: string, context: C) => AssignerSpec<T[keyof T], C>
}
type _AssignerSpecLiteral<T> = { Literal: T }
type _AssignerSpecLiteralDefaultNull<T> = { LiteralDefaultNull: T }

export type AssignerSpec<T, C> =
    | _AssignerSpecInterface<T, C>
    | _AssignerSpecIndex<T, C>
    | _AssignerSpecLiteral<T>
    | _AssignerSpecLiteralDefaultNull<T>

export const Interface = <T, C>(a: {
    [K in keyof T]: AssignerSpec<T[K], C>
}): _AssignerSpecInterface<T, C> => ({ Interface: a })

export const Index = <T, C>(
    f: (k: string, context: C) => AssignerSpec<T[keyof T], C>
): _AssignerSpecIndex<T, C> => ({
    Index: f,
})

export const Literal = <T>(v: T): _AssignerSpecLiteral<T> => ({ Literal: v })

export const LiteralDefaultNull = <T>(
    v: T
): _AssignerSpecLiteralDefaultNull<T | null> => ({ LiteralDefaultNull: v })

export const Assigner = <T extends { [k: string]: any }, C>(
    spec: AssignerSpec<T, C>,
    context: C,
    _obj: Partial<T>,
): T => {
    if ('Literal' in spec) {
        return spec.Literal
    } else if ('LiteralDefaultNull' in spec) {
        return spec.LiteralDefaultNull
    }

    const obj = assignerInitializeDefaults(_obj, spec)
    return new Proxy<T>(obj, {
        get: (_, k) => {
            const key = String(k) as keyof T
            let nextSpec: AssignerSpec<T[keyof T], C>
            if ('Index' in spec) {
                nextSpec = spec.Index(key as string, context)
                obj[key] = assignerInitializeDefaults(obj[key], nextSpec)
            } else if ('Interface' in spec) {
                nextSpec = spec.Interface[key]
                if ('LiteralDefaultNull' in nextSpec) {
                    obj[key] = nextSpec.LiteralDefaultNull
                }
            } else {
                throw new Error('no builder')
            }

            return Assigner(nextSpec, context, obj[key])
        },

        set: () => {
            throw new Error('This Proxy is read-only.')
        },
    })
}

export const assignerInitializeDefaults = <T extends { [k: string]: any }, C>(
    _obj: Partial<T> | undefined,
    spec: AssignerSpec<T, C>
): T => {
    if ('Index' in spec) {
        return (_obj || {}) as any
    } else if ('Interface' in spec) {
        const obj = (_obj || {}) as any
        Object.entries(spec.Interface).forEach(([key, nextSpec]) => {
            obj[key] = assignerInitializeDefaults(obj[key], nextSpec)
        })
        return obj
    } else if ('Literal' in spec) {
        return spec.Literal
    } else if ('LiteralDefaultNull' in spec) {
        return null as any
    } else {
        throw new Error('Invalid Assigner')
    }
}
