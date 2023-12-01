/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
import assert from 'assert'
import { createNamespace } from './namespace'

describe('code-variable-names', () => {
    describe('createNamespace', () => {
        describe('get', () => {
            it('should proxy access to exisinting keys', () => {
                const namespace = createNamespace('dummy', {
                    bla: '1',
                    hello: '2',
                })
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.hello, '2')
            })
    
            it('should create automatic $ alias for keys starting with a number', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        '0': 'blabla',
                        '0_bla': 'bloblo',
                    }
                )
                assert.strictEqual(namespace.$0, 'blabla')
                assert.strictEqual(namespace.$0_bla, 'bloblo')
            })
    
            it('should throw error when trying to access unknown key', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                        hello: '2',
                    }
                )
                assert.throws(() => namespace.blo)
            })
    
            it('should not prevent from using JSON stringify', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                        hello: '2',
                    }
                )
                assert.deepStrictEqual(
                    JSON.stringify(namespace),
                    '{"bla":"1","hello":"2"}'
                )
            })
        })
        
        describe('set', () => {
            it('should allow setting a key that doesnt aready exist', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                    }
                )
                namespace.blo = '2'
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.blo, '2')
            })
            it('should throw error when trying to overwrite existing key', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                    }
                )
                assert.throws(() => (namespace.bla = '2'))
            })
            it('should allow setting a number key using dollar syntax', () => {
                const namespace: { [key: string]: string } = createNamespace('', {})
                namespace.$0 = 'bla'
                assert.strictEqual(namespace['0'], 'bla')
                assert.strictEqual(namespace.$0, 'bla')
            })
        })
    })
})
