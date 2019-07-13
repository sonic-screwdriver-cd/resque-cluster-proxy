'use strict';

const assert = require('assert');
const Protocol = require('../lib/protocol');
const sinon = require('sinon');

const data = {
    // type: [
    //     [ input, expectedOutput ]
    // ]
    string: [
        [ 'test', "+test\r\n" ],
        [ "foo\nbar", "$7\r\nfoo\nbar\r\n" ]
    ],
    array: [
        [ [ 'KEYS', '*' ], "*2\r\n+KEYS\r\n+*\r\n" ],
        [ [ "complex\r\nstring" ], "*1\r\n$15\r\ncomplex\r\nstring\r\n" ]
    ],
    number: [
        [ 123, ":123\r\n" ]
    ],
    mixed: [
        [ [0, ['data']], "*2\r\n:0\r\n*1\r\n+data\r\n" ],
        [ ['data', [456, "a\nb\n\c"]], "*2\r\n+data\r\n*2\r\n:456\r\n$5\r\na\nb\nc\r\n" ],
        [ [0, [1, [2, [3] ] ] ], "*2\r\n:0\r\n*2\r\n:1\r\n*2\r\n:2\r\n*1\r\n:3\r\n" ],
        [ [0, new Error('msg') ], "*2\r\n:0\r\n-Error msg\r\n" ]
    ],
    error: [
        [ new Error('msg'), "-Error msg\r\n" ],
    ]
};

describe('Encoder', () => {
    Object.keys(data).forEach(type => {
        it('encodes ' + type, () => {
            data[type].forEach(testdata => {
                assert.equal(Protocol.encode(testdata[0]).toString(), testdata[1]);
            });
        });
    })
});

