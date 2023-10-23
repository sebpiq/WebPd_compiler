import {
    GlobalCodeDefinitionExport,
    GlobalCodeDefinitionImport
} from '../../types';

export const compileImport = ({ name }: GlobalCodeDefinitionImport) => `
    exports.${name} = () => { throw new Error('import for ${name} not provided') }
    const ${name} = (...args) => exports.${name}(...args)
`;

export const compileExport = ({ name }: GlobalCodeDefinitionExport) => `
    exports.${name} = ${name}
`;
