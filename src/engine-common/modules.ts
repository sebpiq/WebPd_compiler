interface BindingSpecRaw {
    type: 'raw'
}
interface BindingSpecBinding<ValueType> {
    type: 'proxy'
    value: ValueType
}
interface BindingSpecCallback<ValueType> {
    type: 'callback'
    value: ValueType
}

type BindingSpec<ValueType> =
    | BindingSpecRaw
    | BindingSpecBinding<ValueType>
    | BindingSpecCallback<ValueType>

/** @TODO : TEST */
export const createModule = <ModuleType extends { [key: string]: any }>(
    rawModule: { [key: string]: any },
    bindings: {
        [Property in keyof ModuleType]: BindingSpec<ModuleType[Property]>
    },
): ModuleType =>
    new Proxy(rawModule, {
        get: (_, k) => {
            if (bindings.hasOwnProperty(String(k))) {
                const key = String(k) as keyof ModuleType
                const bindingSpec = bindings[key]
                switch (bindingSpec.type) {
                    case 'raw':
                        if (rawModule.hasOwnProperty(String(k))) {
                            return (rawModule as any)[key]
                        } else {
                            throw new Error(
                                `Key ${String(key)} doesn't exist in raw module`
                            )
                        }
                    case 'proxy':
                    case 'callback':
                        return bindingSpec.value
                }
            } else {
                return undefined
            }
        },

        set: (_, k, newValue) => {
            if (bindings.hasOwnProperty(String(k))) {
                const key = String(k) as keyof ModuleType
                const bindingSpec = bindings[key]
                if (bindingSpec.type === 'callback') {
                    bindingSpec.value = newValue
                } else {
                    throw new Error(`Binding key ${String(key)} is read-only`)
                }
            } else {
                throw new Error(`Key ${String(k)} is not defined in bindings`)
            }
            return true
        },
    }) as ModuleType
