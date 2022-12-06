import { buildRollupConfig } from '@webpd/dev/configs/rollup.mjs'
export default buildRollupConfig({
    importAsString: ['**/*.asc'],
})
