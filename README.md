WebPd JS/Wasm audio compiler
=============================

A compiler that takes a DSP graph as an input and renders source code as an output. For now, supported targets are :

- **JavaScript** : faster compilation
- **AssemblyScript** : can be compiled to WebAssembly for better performance

This is part of the [WebPd](https://github.com/sebpiq/WebPd) project, but can also be used as a standalone library (although for now you'll have to read the source).

Distributing
--------------

Distributed files are configured in `package.json` section `files`.

This setting contains `dist/`, which corresponds with the built library.

It also contains the whole `src/` because want to distribute test helpers as well but without building them. However, ideally we would not need to distribute all these files. A better option might be to build test helpers in a separate bundle, with a separate entry point.