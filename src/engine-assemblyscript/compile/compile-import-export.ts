import { GlobalCodeDefinitionExport, GlobalCodeDefinitionImport } from '../../types';
import macros from './macros';

export const compileImport = (
    { name, args, returns }: GlobalCodeDefinitionImport
) => `export declare function ${name} ${macros.Func(
    args.map((a) => macros.Var(a[0], a[1])),
    returns
)}`;

export const compileExport = (
    { name }: GlobalCodeDefinitionExport
) => `export { ${name} }`;
