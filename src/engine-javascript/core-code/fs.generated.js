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
// Max length : about 10s at sample rate 44100
var _FS_SOUND_BUFFER_MAX_LENGTH = 10 * 44100;
var _FS_OPERATIONS_IDS = new Set();
var _FS_OPERATIONS_CALLBACKS = new Map();
var _FS_OPERATIONS_SOUND_CALLBACKS = new Map();
var _FS_SOUND_STREAM_BUFFERS = new Map();
var FILE_OPERATION_COUNTER = 0;
// =========================== EXPORTED API
function x_fs_readSoundFileResponse(id, status, sound) {
    if (!_FS_OPERATIONS_IDS.has(id)) {
        return;
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
        return -1;
    }
    var buffer = _FS_SOUND_STREAM_BUFFERS.get(id);
    return buffer.pushBlock(block);
}
function x_fs_soundStreamClose(id) {
    if (!_FS_OPERATIONS_IDS.has(id)) {
        return;
    }
    _FS_OPERATIONS_IDS.delete(id);
    var callback = _FS_OPERATIONS_CALLBACKS.get(id);
    callback(id, FS_OPERATION_SUCCESS);
    fs_requestCloseSoundStream(id);
}
// =========================== FS API
function fs_readSoundFile(url, callback) {
    var id = FILE_OPERATION_COUNTER++;
    _FS_OPERATIONS_IDS.add(id);
    _FS_OPERATIONS_SOUND_CALLBACKS.set(id, callback);
    fs_requestReadSoundFile(id, url, new ArrayBuffer(0));
    return id;
}
function fs_readSoundStream(url, callback) {
    var id = FILE_OPERATION_COUNTER++;
    var buffer = new _fs_SoundBuffer(_FS_SOUND_BUFFER_MAX_LENGTH);
    _FS_OPERATIONS_IDS.add(id);
    _FS_SOUND_STREAM_BUFFERS.set(id, buffer);
    _FS_OPERATIONS_CALLBACKS.set(id, callback);
    fs_requestReadSoundStream(id, url, new ArrayBuffer(0));
    return id;
}
function fs_writeSoundFile(url, sound) {
    var id = FILE_OPERATION_COUNTER++;
    _FS_OPERATIONS_IDS.add(id);
    fs_requestWriteSoundFile(url, sound, new ArrayBuffer(0));
    return id;
}
// =========================== PRIVATE
var _fs_SoundBuffer = /** @class */ (function () {
    function _fs_SoundBuffer(maxLength) {
        // Dummy block that'll get kicked at the first pullFrame
        this.blocks = [[new ${FloatArray}(0)]];
        this.maxLength = maxLength;
        this.currentLength = 0;
        this.currentBlockCursor = 0;
        this.currentBlockLength = 0;
        this.currentBlock = [];
    }
    _fs_SoundBuffer.prototype.pushBlock = function (block) {
        var additionalLength = block[0].length;
        if (this.currentLength + additionalLength > this.maxLength) {
            throw new Error("buffer is full");
        }
        this.blocks.push(block);
        this.currentLength += additionalLength;
        // Returns space available
        return this.maxLength - this.currentLength;
    };
    _fs_SoundBuffer.prototype.availableFrameCount = function () {
        return this.currentLength - this.currentBlockCursor;
    };
    _fs_SoundBuffer.prototype.pullFrame = function () {
        if (this.currentBlockCursor >= this.currentBlockLength) {
            var discardedBlock = this.blocks.shift();
            this.currentLength -= discardedBlock[0].length;
            this.currentBlock = this.blocks[0];
            this.currentBlockLength = this.currentBlock[0].length;
            this.currentBlockCursor = 0;
        }
        var currentBlockCursor = this.currentBlockCursor++;
        var currentBlock = this.currentBlock;
        var channelCount = this.currentBlock.length;
        var frame = new ${FloatArray}(channelCount);
        for (var channel = 0; channel < channelCount; channel++) {
            frame[channel] = currentBlock[channel][currentBlockCursor];
        }
        return frame;
    };
    return _fs_SoundBuffer;
}());
