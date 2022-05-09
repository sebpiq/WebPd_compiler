import { NodeImplementations } from "../types";
import * as oscTilde from '../nodes/osc~'
import * as dacTilde from '../nodes/dac~'
// import * as tabplayTilde from '../nodes/tabplay~'

const NODE_IMPLEMENTATIONS: NodeImplementations = {
    'osc~': oscTilde,
    'dac~': dacTilde,
    // 'tabplay~': tabplayTilde,
}

export default NODE_IMPLEMENTATIONS