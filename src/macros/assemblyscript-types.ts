export type InternalPointer = number
export type StringPointer = number
// Pointer to an array buffer that contains i32 integers.
// This is what we use to pass generic data back and forth from the module.
// Because the memory layout is not fixed for data types other than strings
// REF : https://www.assemblyscript.org/runtime.html#memory-layout
export type ArrayBufferOfIntegersPointer = number