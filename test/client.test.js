'use strict';

const assert = require('assert');
const sinon = require('sinon');
const ioredis = require('ioredis');

describe('ClusterClient', () => {
    const redisClientMock = function() {
        return {
            keys: sinon.stub(),
            del: sinon.stub(),
            mget: sinon.stub(),
            flushall: sinon.stub()
        }
    };
    let masters;
    let client;
    let ioredisMock;
    let clusterMock;
    let sandbox;
    let ctorStub;
    let delStub;
    let keysStub;
    let nodesStub;
    let mgetStub;
    let selectStub;
    let flushallStub;
    let cluster;
    const keys = new Array(100).fill(null).map((v, i) => i.toString());

    beforeEach(() => {

        sandbox = sinon.createSandbox();
        delStub = sandbox.stub(ioredis.Cluster.prototype, 'del');
        keysStub = sandbox.stub(ioredis.Cluster.prototype, 'keys');
        mgetStub = sandbox.stub(ioredis.Cluster.prototype, 'mget');
        nodesStub = sandbox.stub(ioredis.Cluster.prototype, 'nodes');
        flushallStub = sandbox.stub(ioredis.Cluster.prototype, 'flushall');
        selectStub = sandbox.stub(ioredis.Cluster.prototype, 'select');

        masters = [
            new redisClientMock(),
            new redisClientMock()
        ];
        masters[0].keys.resolves(keys.slice(0, 10));
        masters[1].keys.resolves(keys.slice(10));
        nodesStub.resolves(masters);

        client = require('../lib/client');

        cluster = new client();
    });

    afterEach(() => {
        sandbox.restore();
        cluster.quit();
    });


    describe('keys', () => {
        it('requests to all masters and resolves with merged data', () => {
            return cluster.keys('*').then((result) => {
                assert.deepEqual(result, keys);
                assert(masters[0].keys.calledOnce);
                assert(masters[0].keys.calledWith('*'));
                assert(masters[1].keys.calledOnce);
                assert(masters[1].keys.calledWith('*'));
            });
        });

        it('requests to all masters with pattern and resolves with merged data', () => {
            return cluster.keys('foo*').then((result) => {
                assert.deepEqual(result, keys);
                assert(masters[0].keys.calledOnce);
                assert(masters[0].keys.calledWith('foo*'));
                assert(masters[1].keys.calledOnce);
                assert(masters[1].keys.calledWith('foo*'));
            });
        });

        it('resolves with deduped keys (inconsistent)', () => {
            const newKey = keys.slice(1).concat([keys[0]]);
            masters[1].keys.resolves(newKey);

            return cluster.keys('*').then((result) => {
                assert.deepEqual(result, keys);
            });
        });

        it('rejects with error message when a request fails', () => {
            const message = 'ERR: error';
            masters[1].keys.rejects(new Error(message));

            return cluster.keys('*').then((result) => {
                assert.fail("This code doesn't run");
            }).catch((err) => {
                assert.equal(err.message, message);
            });
        });
    });

    describe('scan', () => {

        it('requests to all masters and resolves with merged keys', () => {
            return cluster.scan(0).then((result) => {
                // cursor must be always 0 as results include everything
                assert.deepEqual(result, [0, keys]);
                assert(masters[0].keys.calledOnce);
                assert(masters[0].keys.calledWith('*'));
                assert(masters[1].keys.calledOnce);
                assert(masters[1].keys.calledWith('*'));
            });
        });

        it('requests to all masters with parameter and resolves', () => {
            return cluster.scan(0, 'MATCH', 'foo*').then((result) => {
                assert.deepEqual(result, [0, keys]);
                assert(masters[0].keys.calledOnce);
                assert(masters[0].keys.calledWith('foo*'));
                assert(masters[1].keys.calledOnce);
                assert(masters[1].keys.calledWith('foo*'));
            });
        });

        it('resolves with deduped merged keys', () => {
            masters[0].keys.resolves(keys);

            return cluster.scan(0).then((result) => {
                assert.deepEqual(result, [0, keys]);
            });
        });
    });

    describe('del', () => {
        const keys = ['foo', 'bar', 'baz'];

        beforeEach(() => {
            delStub.resolves(1);
        });

        it('resolves with deleted key number', () => {
            return cluster.del(...keys).then((num) => {
                assert.equal(num, keys.length);
            });
        });

        it('requests for each key and resolves with sum of results', () => {
            const result = new Array(keys.length).fill(null).map((v, i) => i);
            let expected = 0;

            for (let i=0; i<keys.length; i++) {
                delStub.withArgs(keys[i]).resolves(result[i]);
                expected += result[i];
            }

            return cluster.del(...keys).then((num) => {
                assert.equal(num, expected);
            });
        });

        it('rejects with error if a request fails', () => {
            const message = 'error';

            delStub.onCall(0).rejects(new Error(message));

            return cluster.del('key1', 'key2').then((num) => {
                assert.fail("This code shouldn't run");
            }).catch((err) => {
                assert.equal(err.message, message);
            });
        });
    });

    describe('mget', () => {
        const mkeys = ['foo', 'bar', 'baz'];
        const mresults = ['foo1', 'bar1', 'baz1'];
        let redis;

        beforeEach(() => {
            for (let i=0; i<mkeys.length; i++) {
                mgetStub.withArgs(mkeys[i]).resolves(mresults[i]);
            };
        });

        it('requests for each key and resolves with merged results', () => {
            return cluster.mget(...mkeys).then((res) => {
                assert.deepEqual(res, mresults);
            });
        });

        it('requests for each key and resolves with missing key', () => {
            const newResults = [].concat(mresults); // copy

            newResults[0] = null;
            mgetStub.withArgs(mkeys[0]).resolves([null]);

            return cluster.mget(...mkeys).then((res) => {
                assert.deepEqual(res, newResults);
            });
        });

        it('rejects if a request fails', () => {
            const message = 'ERR: error';
            mgetStub.withArgs(mkeys[2]).rejects(new Error(message));

            return cluster.mget(...mkeys).then((res) => {
                assert.fail("This code shouldn't run");
            }).catch((err) => {
                assert.equal(err.message, message);
            });
        });
    });

    describe('flulshall', () => {
        it('calls flushall on each master node', () => {
            return cluster.flushall().then((res) => {
                assert.equal(res, 'OK');
                assert(masters[0].flushall.calledOnce);
                assert(masters[1].flushall.calledOnce);
            })
        });
    });

    describe('select', () => {
        it('selects always database 0', () => {
            selectStub.resolves('OK');

            return cluster.select(100).then((res) => {
                assert.equal(res, 'OK');
                assert(selectStub.calledOnce);
                assert(selectStub.calledWith(0));
            })
        });

        it('rejects if actual operation fails', () => {
            selectStub.rejects(new Error('error'));

            return cluster.select(100).then(() => {
                assert.fail("This code shouldn't run");
            }).catch((err) => {
                assert.equal(err.message, 'error');
            });
        });
    });
});
