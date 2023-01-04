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
var FS_OPERATION_SUCCESS = ${FS_OPERATION_SUCCESS};
var FS_OPERATION_FAILURE = ${FS_OPERATION_FAILURE};
var _FS_OPERATIONS_IDS = new Set();
var _FS_OPERATIONS_CALLBACKS = new Map();
var _FS_OPERATIONS_SOUND_CALLBACKS = new Map();
var _FS_SOUND_STREAM_BUFFERS = new Map();
var FILE_OPERATION_COUNTER = 0;
// =========================== EXPORTED API
function x_fs_readSoundFileResponse(id, status, sound) {
    if (!_FS_OPERATIONS_IDS.has(id)) {
        throw new Error("fs_readSoundFileResponse operation unknown : \"${id}\"");
    }
    _FS_OPERATIONS_IDS.delete(id);
    _FS_OPERATIONS_SOUND_CALLBACKS.get(id)(id, status, sound);
    _FS_OPERATIONS_SOUND_CALLBACKS.delete(id);
}
function x_fs_writeSoundFileResponse(id) {
    _FS_OPERATIONS_IDS.delete(id);
}
function x_fs_soundStreamData(id, block) {
    if (!_FS_OPERATIONS_IDS.has(id)) {
        throw new Error("fs_soundStreamData operation unknown : \"${id}\"");
    }
    return _FS_SOUND_STREAM_BUFFERS.get(id).pushBlock(block);
}
// =========================== FS API
function fs_readSoundFile(url, callback) {
    var id = FILE_OPERATION_COUNTER++;
    _FS_OPERATIONS_IDS.add(id);
    _FS_OPERATIONS_SOUND_CALLBACKS.set(id, callback);
    fs_requestReadSoundFile(id, url, msg_create([]));
    return id;
}
function fs_readSoundStream(url, info, callback) {
    var id = FILE_OPERATION_COUNTER++;
    var channelCount = ${Int}(msg_readFloatToken(info, 0));
    var buffer = new _fs_SoundBuffer(channelCount);
    _FS_OPERATIONS_IDS.add(id);
    _FS_SOUND_STREAM_BUFFERS.set(id, buffer);
    _FS_OPERATIONS_CALLBACKS.set(id, callback);
    fs_requestReadSoundStream(id, url, info);
    return id;
}
function fs_soundStreamClose(id, status) {
    if (!_FS_OPERATIONS_IDS.has(id)) {
        return;
    }
    _FS_OPERATIONS_IDS.delete(id);
    _FS_OPERATIONS_CALLBACKS.get(id)(id, status);
    _FS_OPERATIONS_CALLBACKS.delete(id);
    // Delete this last, to give the callback a chance to save a reference to the buffer
    _FS_SOUND_STREAM_BUFFERS.delete(id);
    fs_requestCloseSoundStream(id, status);
}
function fs_writeSoundFile(url, sound) {
    var id = FILE_OPERATION_COUNTER++;
    _FS_OPERATIONS_IDS.add(id);
    fs_requestWriteSoundFile(url, sound, msg_create([]));
    return id;
}
// Structure : [channelCount]
function fs_soundInfo(channelCount) {
    var info = msg_create([MSG_TOKEN_TYPE_FLOAT]);
    msg_writeFloatToken(info, 0, ${Float}(channelCount));
    return info;
}
// =========================== PRIVATE
// TODO : Optimize by flattening frames + ring buffer (allows to read/write directly from host)
var _fs_SoundBuffer = /** @class */ (function () {
    function _fs_SoundBuffer(channelCount) {
        this.voidBlock = [new ${FloatArray}(0)];
        this.frameArray = new ${FloatArray}(channelCount);
        this.channelCount = channelCount;
        this.currentLength = 0;
        this.blocks = [];
        this.currentBlock = [];
        this._loadCurrentBlock(this.voidBlock);
    }
    _fs_SoundBuffer.prototype.pushBlock = function (block) {
        this.currentLength += block[0].length;
        if (!this._hasCurrentBlock()) {
            this._loadCurrentBlock(block);
        }
        else {
            this.blocks.push(block);
        }
        return this.availableFrameCount();
    };
    _fs_SoundBuffer.prototype.availableFrameCount = function () {
        return this.currentLength - this.currentBlockCursor;
    };
    _fs_SoundBuffer.prototype.pullFrame = function () {
        if (this.currentBlockCursor >= this.currentBlockLength) {
            // Discard current block and load next one
            if (this._hasCurrentBlock()) {
                this.currentLength -= this.currentBlock[0].length;
                if (this.blocks.length !== 0) {
                    this._loadCurrentBlock(this.blocks.shift());
                }
                else {
                    this._resetFrameArray();
                    this._loadCurrentBlock(this.voidBlock);
                }
            }
            if (!this._hasCurrentBlock()) {
                return this.frameArray;
            }
        }
        var currentBlockCursor = this.currentBlockCursor++;
        var currentBlock = this.currentBlock;
        for (var channel = 0; channel < this.channelCount; channel++) {
            this.frameArray[channel] = currentBlock[channel][currentBlockCursor];
        }
        return this.frameArray;
    };
    _fs_SoundBuffer.prototype.getCurrentBlock = function () {
        return this.currentBlock;
    };
    _fs_SoundBuffer.prototype._loadCurrentBlock = function (block) {
        this.currentBlock = block;
        this.currentBlockLength = block[0].length;
        this.currentBlockCursor = 0;
    };
    _fs_SoundBuffer.prototype._hasCurrentBlock = function () {
        return this.currentBlock[0].length !== 0;
    };
    _fs_SoundBuffer.prototype._resetFrameArray = function () {
        for (var channel = 0; channel < this.channelCount; channel++) {
            this.frameArray[channel] = 0;
        }
    };
    return _fs_SoundBuffer;
}());
