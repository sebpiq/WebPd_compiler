// REF : https://hackernoon.com/mastering-type-safe-json-serialization-in-typescript
type JSONPrimitive = string | number | boolean | null | undefined

type JSONValue =
    | JSONPrimitive
    | JSONValue[]
    | {
          [key: string]: JSONValue
      }

export type JSONCompatible<T> = unknown extends T
    ? never
    : {
          [P in keyof T]: T[P] extends JSONValue
              ? T[P]
              : T[P] extends NotAssignableToJson
              ? never
              : JSONCompatible<T[P]>
      }

type NotAssignableToJson = bigint | symbol | Function

export type CustomMetadataType = {
    [key: string]: JSONValue
}