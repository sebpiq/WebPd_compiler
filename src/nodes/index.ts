/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { NodeImplementations } from '../types'
import * as oscTilde from './osc~'
import * as dacTilde from './dac~'
import * as tabplayTilde from './tabplay~'
import * as metro from './metro'
import * as loadbang from './loadbang'
import binopTilde from './binop~'
import * as mixerTilde from './mixer~'
import * as noiseTilde from './noise~'
import * as msg from './msg'

const NODE_IMPLEMENTATIONS: NodeImplementations = {
    ...binopTilde,
    'osc~': oscTilde,
    'noise~': noiseTilde,
    'mixer~': mixerTilde,
    'dac~': dacTilde,
    'tabplay~': tabplayTilde,
    loadbang: loadbang,
    msg: msg,
    metro: metro,
}

export default NODE_IMPLEMENTATIONS
