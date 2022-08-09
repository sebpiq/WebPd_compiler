import { buildRollupConfig } from '@webpd/shared/configs/rollup.mjs'
export default buildRollupConfig({ 
    importAsString: [
        '**/*.asc',
    ] 
})