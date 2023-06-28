import jestWebPdDefault from '@webpd/dev/configs/jest.js'

export default {
    ...jestWebPdDefault,
    moduleNameMapper: {
        '^([./a-zA-Z0-9$_-]+)\\.asc$': './__mock__/$1.asc.ts',
        '^([./a-zA-Z0-9$_-]+)\\.js.txt$': './__mock__/$1.js.ts',
    },
}