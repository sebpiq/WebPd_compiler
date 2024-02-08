import { UserCompilationSettings, CompilerTarget, CompilationSettings } from './types';

/** Asserts user provided settings are valid (or throws error) and sets default values. */
export const validateSettings = (
    compilationSettings: UserCompilationSettings,
    target: CompilerTarget
): CompilationSettings => {
    const arrays = compilationSettings.arrays || {}
    const io = {
        messageReceivers: (compilationSettings.io || {}).messageReceivers || {},
        messageSenders: (compilationSettings.io || {}).messageSenders || {},
    }
    const debug = compilationSettings.debug || false
    const audio = compilationSettings.audio || {
        channelCount: { in: 2, out: 2 },
        bitDepth: 64,
    }
    if (![32, 64].includes(audio.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }

    return {
        audio,
        arrays,
        io,
        debug,
        target,
    }
}

class InvalidSettingsError extends Error {}