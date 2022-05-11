import { NodeImplementations } from '../types'
import * as oscTilde from './osc~'
import * as dacTilde from './dac~'
import * as tabplayTilde from './tabplay~'

const NODE_IMPLEMENTATIONS: NodeImplementations = {
    'osc~': oscTilde,
    'dac~': dacTilde,
    'tabplay~': tabplayTilde,
}

export default NODE_IMPLEMENTATIONS
