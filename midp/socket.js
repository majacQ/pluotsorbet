/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

var SOCKET_OPT = {
  DELAY: 0,
  LINGER: 1,
  KEEPALIVE: 2,
  RCVBUF: 3,
  SNDBUF: 4,
};

Native["com/sun/midp/io/j2me/socket/Protocol.getIpNumber0.(Ljava/lang/String;[B)I"] = function(ctx, stack) {
    var ipBytes = stack.pop(), host = stack.pop(), _this = stack.pop();
    // We'd need to modify ipBytes, that is an array with length 0
    // But we don't really need to do that, because getIpNumber0 is called only
    // before open0. So we just need to store the host and pass it to
    // mozTCPSocket::open.
    _this.host = util.fromJavaString(host);
    stack.push(0);
}

Native["com/sun/midp/io/j2me/socket/Protocol.getHost0.(Z)Ljava/lang/String;"] = function(ctx, stack) {
    var local = stack.pop(), _this = stack.pop();
    stack.push(ctx.newString((local) ? "127.0.0.1" : _this.socket.host));
}

function Socket(host, port) {
    this.pipe = DumbPipe.open("socket", { host: host, port: port }, this.handleMessage.bind(this));
    this.isClosed = false;
}

Socket.prototype.handleMessage = function(message) {
    switch (message.type) {
        case "open":
            if (this.onopen) {
                this.onopen();
            }
            break;
        case "error":
            if (this.onerror) {
                this.onerror(message.error);
            }
            this.pipe = null;
            break;
        case "data":
            if (this.ondata) {
                this.ondata(message.data);
            }
            break;
        case "send":
            if (this.onsend) {
                this.onsend(message.result);
            }
            break;
        case "drain":
            if (this.ondrain) {
                this.ondrain();
            }
            break;
        case "close":
            this.isClosed = true;
            if (this.onclose) {
                this.onclose();
            }
            // DumbPipe.close(this.pipe);
            this.pipe = null;
            break;
    }
}

Socket.prototype.send = function(data, offset, length) {
    // Convert the data to a regular Array to traverse the mozbrowser boundary.
    data = Array.prototype.slice.call(data);
    data.constructor = Array;

    this.pipe({ type: "send", data: data, offset: offset, length: length });
}

Socket.prototype.close = function() {
    window.setZeroTimeout(function() {
        this.pipe({ type: "close" });
    }.bind(this));
}

Native["com/sun/midp/io/j2me/socket/Protocol.open0.([BI)V"] = function(ctx, stack) {
    var port = stack.pop(), ipBytes = stack.pop(), _this = stack.pop();
    // console.log("Protocol.open0: " + _this.host + ":" + port);

    _this.socket = new Socket(_this.host, port);

    _this.options = {};
    _this.options[SOCKET_OPT.DELAY] = 1;
    _this.options[SOCKET_OPT.LINGER] = 0;
    _this.options[SOCKET_OPT.KEEPALIVE] = 1;
    _this.options[SOCKET_OPT.RCVBUF] = 8192;
    _this.options[SOCKET_OPT.SNDBUF] = 8192;

    _this.data = new Uint8Array();
    _this.waitingData = null;

    _this.socket.onopen = function() {
        ctx.resume();
    }

    _this.socket.onerror = function(error) {
        ctx.raiseException("java/io/IOException", error);
        ctx.resume();
    }

    _this.socket.ondata = function(data) {
        var receivedData = new Uint8Array(data);
        var newArray = new Uint8Array(_this.data.byteLength + receivedData.byteLength);
        newArray.set(_this.data);
        newArray.set(receivedData, _this.data.byteLength);
        _this.data = newArray;

        if (_this.waitingData) {
            _this.waitingData();
        }
    }

    throw VM.Pause;
}

Native["com/sun/midp/io/j2me/socket/Protocol.available0.()I"] = function(ctx, stack) {
    var _this = stack.pop();
    // console.log("Protocol.available0: " + _this.data.byteLength);
    stack.push(_this.data.byteLength);
}

Native["com/sun/midp/io/j2me/socket/Protocol.read0.([BII)I"] = function(ctx, stack) {
    var length = stack.pop(), offset = stack.pop(), data = stack.pop(), _this = stack.pop();

    // console.log("Protocol.read0: " + _this.socket.isClosed);

    if (_this.socket.isClosed) {
        stack.push(-1);
        return;
    }

    function copyData() {
        var toRead = (length < _this.data.byteLength) ? length : _this.data.byteLength;

        data.set(_this.data.subarray(0, toRead), offset);

        _this.data = new Uint8Array(_this.data.buffer.slice(toRead));

        stack.push(toRead);
    }

    if (_this.data.byteLength == 0) {
        _this.waitingData = function() {
            _this.waitingData = null;
            copyData();
            ctx.resume();
        }
        throw VM.Pause;
    }

    copyData();
}

Native["com/sun/midp/io/j2me/socket/Protocol.write0.([BII)I"] = function(ctx, stack) {
    var length = stack.pop(), offset = stack.pop(), data = stack.pop(), _this = stack.pop();
    // console.log("Protocol.write0: " + String.fromCharCode.apply(String, Array.prototype.slice.call(data.subarray(offset, offset + length))));

    _this.socket.onsend = function(result) {
        _this.socket.onsend = null;
        if (result) {
            stack.push(length);
            ctx.start();
        } else {
            _this.socket.ondrain = function() {
                _this.socket.ondrain = null;
                stack.push(length);
                ctx.start();
            };
        }
    }

    _this.socket.send(data, offset, length);

    throw VM.Pause;
}

Native["com/sun/midp/io/j2me/socket/Protocol.setSockOpt0.(II)V"] = function(ctx, stack) {
    var value = stack.pop(), option = stack.pop(), _this = stack.pop();

    if (!(option in _this.options)) {
        ctx.raiseException("java/lang/IllegalArgumentException", "Unsupported socket option");
    }

    _this.options[option] = value;
}

Native["com/sun/midp/io/j2me/socket/Protocol.getSockOpt0.(I)I"] = function(ctx, stack) {
    var option = stack.pop(), _this = stack.pop();

    if (!(option in _this.options)) {
        ctx.raiseException("java/lang/IllegalArgumentException", "Unsupported socket option");
    }

    stack.push(_this.options[option]);
}

Native["com/sun/midp/io/j2me/socket/Protocol.close0.()V"] = function(ctx, stack) {
    var _this = stack.pop();

    if (_this.socket.isClosed) {
        return;
    }

    _this.socket.onclose = function() {
        _this.socket.onclose = null;
        ctx.resume();
    }

    _this.socket.close();

    throw VM.Pause;
}

Native["com/sun/midp/io/j2me/socket/Protocol.shutdownOutput0.()V"] = function(ctx, stack) {
    var _this = stack.pop();

    // We don't have the ability to close the output stream independently
    // of the connection as a whole.  But we don't seem to have to do anything
    // here, since this has just two call sites: one in Protocol.disconnect,
    // right before closing the socket; the other in Protocol.closeOutputStream,
    // which says it will be "called once by the child output stream," although
    // I can't find an actual caller.
}

Native["com/sun/midp/io/j2me/socket/Protocol.notifyClosedInput0.()V"] = function(ctx, stack) {
    var _this = stack.pop();

    if (_this.waitingData) {
        console.warn("Protocol.notifyClosedInput0.()V unimplemented while thread is blocked on read0");
    }
}

Native["com/sun/midp/io/j2me/socket/Protocol.notifyClosedOutput0.()V"] = function(ctx, stack) {
    var _this = stack.pop();

    if (_this.socket.ondrain) {
        console.warn("Protocol.notifyClosedOutput0.()V unimplemented while thread is blocked on write0");
    }
}
