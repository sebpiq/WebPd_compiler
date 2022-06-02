import { NodeImplementations } from '../types'
import * as oscTilde from './osc~'
import * as dacTilde from './dac~'
import * as tabplayTilde from './tabplay~'
import * as metro from './metro'
import * as plusTilde from './+~'
import * as starTilde from './*~'
import * as mixerTilde from './mixer~'

const NODE_IMPLEMENTATIONS: NodeImplementations = {
    'osc~': oscTilde,
    '+~': plusTilde,
    '*~': starTilde,
    'mixer~': mixerTilde,
    'dac~': dacTilde,
    'tabplay~': tabplayTilde,
    metro: metro,
}

export default NODE_IMPLEMENTATIONS
