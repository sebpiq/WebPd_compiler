import { EngineLifecycleRawModule } from '../../engine-javascript/run'
import { getFloatArrayType, attachBindings } from '../../run/run-helpers'
import { EngineMetadata, Engine, FloatArray } from '../../run/types'
import { CommonsApi, CommonsExportsJavaScript } from './types'

export interface CommonsRawModule extends EngineLifecycleRawModule {
    globals: {
        commons: CommonsExportsJavaScript
    }
}

export const createCommonsModule = (
    rawModule: CommonsRawModule,
    metadata: EngineMetadata
): CommonsApi => {
    const floatArrayType = getFloatArrayType(metadata.settings.audio.bitDepth)
    return attachBindings<Engine['globals']['commons']>(rawModule, {
        getArray: {
            type: 'proxy',
            value: (arrayName) => rawModule.globals.commons.getArray(arrayName),
        },
        setArray: {
            type: 'proxy',
            value: (arrayName: string, array: FloatArray | Array<number>) =>
                rawModule.globals.commons.setArray(
                    arrayName,
                    new floatArrayType(array)
                ),
        },
    })
}
