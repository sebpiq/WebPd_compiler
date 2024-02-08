import assert from "assert"
import { validateSettings } from "./settings"

describe('validateSettings', () => {
    it('should validate settings and set defaults', () => {
        const settings = validateSettings({}, 'javascript')
        assert.deepStrictEqual(settings.io, {
            messageReceivers: {},
            messageSenders: {},
        })
        assert.deepStrictEqual(settings.arrays, {})
        assert.deepStrictEqual(settings.audio, {
            channelCount: { in: 2, out: 2 },
            bitDepth: 64,
        },)
    })

    it('should throw error if bitDepth invalid', () => {
        assert.throws(() =>
            validateSettings({
                target: 'assemblyscript',
                audio: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth: 666,
                },
            } as any, 'javascript')
        )
    })
})