Non-included dependencies
---------------------------

Right now requires a polyfill for AudioWorklet

assemblyscript 
-----------------

Compile a module manually

>>> npx asc loop.ts --bindings esm --exportRuntime -o loop.js


TODO 
------

Fix the audioworklet polyfill (right now it always polyfills)

- run standard tests