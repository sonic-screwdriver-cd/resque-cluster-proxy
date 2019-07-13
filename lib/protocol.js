'use strict';

const Resp = require('respjs');

function encode(data) {
    if (data instanceof Error) {
        return Resp.encodeError(data);
    }

    switch (typeof data) {
        case 'string':
            if (/[\x00-\x1F\x7F]/.test(data)) {
                return Resp.encodeBulk(data);
            } else {
                return Resp.encodeString(data);
            }
            break;

        case 'number':
            return Resp.encodeInteger(data);
            break;

        case 'object':
            if (data === null || data === undefined) {
                return Resp.encodeNull();
            } else if (Array.isArray(data)) {
                let result = [];

                for (let i=0; i<data.length; i++) {
                    result.push(encode(data[i]));
                }
                return Resp.encodeArray(result);
            }

        default:
            throw new Error('Unsupported object: ' + typeof data);
    }
}

module.exports = {
    encode
};
