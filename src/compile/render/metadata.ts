import packageInfo from '../../../package.json'
import { EngineMetadata } from '../../run/types'
import { RenderInput } from './types'

/** Helper to build engine metadata from compilation object */
export const buildMetadata = ({
    precompiledCode: { variableNamesIndex },
    settings: { audio: audioSettings, io }
}: RenderInput): EngineMetadata => ({
    libVersion: packageInfo.version,
    audioSettings: {
        ...audioSettings,
        // Determined at configure
        sampleRate: 0,
        blockSize: 0,
    },
    compilation: {
        io,
        variableNamesIndex: {
            io: variableNamesIndex.io,
        },
    },
})
