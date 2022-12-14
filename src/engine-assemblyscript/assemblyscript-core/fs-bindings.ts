export interface FsListenersCallbacks {
    file_readSoundListener: (url: string, info: any) => void
    file_writeSoundListener: (url: string, data: Array<Float32Array | Float64Array>, info: any) => void
}

export const makeFileListenersWasmImports = (fsListenersCallbacks?: FsListenersCallbacks): FsListenersCallbacks => {
    let file_readSoundListener: FsListenersCallbacks['file_readSoundListener'] = () => undefined
    if (fsListenersCallbacks) {
        file_readSoundListener = (url, info) => {
            fsListenersCallbacks.file_readSoundListener(url, info)
        }
    }
    let file_writeSoundListener: FsListenersCallbacks['file_writeSoundListener'] = () => undefined
    if (fsListenersCallbacks) {
        file_writeSoundListener = (url, data, info) => {
            fsListenersCallbacks.file_writeSoundListener(url, data, info)
        }
    }
    return {
        file_readSoundListener,
        file_writeSoundListener,
    }
}