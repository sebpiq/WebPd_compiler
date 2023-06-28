import { buildRollupConfig } from '@webpd/dev/configs/rollup.mjs'
export default buildRollupConfig({
    importAsString: [
        '**/*.asc',
        './src/core-code/*.js.txt',
    ],
})
