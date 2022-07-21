// Singletons for representing a message datum type in JavaScript
export const MESSAGE_DATUM_TYPE_STRING = Symbol.for('MESSAGE_DATUM_TYPE_STRING')
export const MESSAGE_DATUM_TYPE_FLOAT = Symbol.for('MESSAGE_DATUM_TYPE_FLOAT')
export type MESSAGE_DATUM_TYPE = typeof MESSAGE_DATUM_TYPE_STRING | typeof MESSAGE_DATUM_TYPE_FLOAT