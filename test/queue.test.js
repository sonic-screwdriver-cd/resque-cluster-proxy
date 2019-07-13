'use strict';

const assert = require('assert');
const sinon = require('sinon');
const EventEmitter =require('events').EventEmitter;
const Queue = require('../lib/queue').Queue;
const Job = require('../lib/queue').Job;
const Protocol = require('../lib/protocol');

describe('Queue', () => {
    let client;
    let queue;

    beforeEach(() => {
        client = new EventEmitter();
        client.status = 'ready';
        queue = new Queue(client);
    });

    describe('constructor', () => {

        it('stores client and initialize vars', () => {
            assert.deepEqual(queue.clusterClient, client);
            assert.deepEqual(queue.queue, []);
            assert.equal(queue.working, false);
        });

        it('sets ready event handler to begin process immediately after connect', () => {
            queue.process = sinon.stub();
            client.emit('ready');
            assert(queue.process.calledOnce);
        });
    });

    describe('enqueue', () => {
        let processStub;

        beforeEach(() => {
            processStub = sinon.stub();
            queue.process = processStub;
        });

        it('pushes a job to internal queue', () => {
            const job = { foo: 'bar' };

            assert.equal(queue.queue.length, 0)

            queue.enqueue(job);

            assert.equal(queue.queue.length, 1);
            assert.deepEqual(queue.queue[0], job);
        });

        it('does nothing if other process is working', () => {
            const job = { foo: 'bar' };

            queue.working = true;
            queue.enqueue(job);
            assert(!processStub.called);
        });

        it('does nothing if client state is not ready', () => {
            const job = { foo: 'bar' };

            client.status = 'connecting';
            queue.enqueue(job);
            assert(!processStub.called);
        });

        it('invokes new worker if client state is ready and no other workers', (next) => {
            const job = { foo: 'bar' };

            processStub.callsFake(() => {
                assert(true);
                next();
            });
            queue.enqueue(job);
        });
    });

    describe('process', () => {
        let encodeStub;
        let clientSock = {};
        let sandbox;

        beforeEach(() => {
            client.foo = sinon.stub();
            clientSock.write = sinon.stub();
            sandbox = sinon.createSandbox();
            encodeStub = sandbox.stub(Protocol, 'encode');
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('does nothing if queue has no item', () => {
            return queue.process().then(() => {
                assert(!encodeStub.called);
            });
        });

        it('does nothing if other process is working', () => {
            queue.queue.push({foo: 'bar'});
            queue.working = true;

            return queue.process().then(() => {
                assert(!encodeStub.called);
            });
        });

        it('calls redis client and write results to client', () => {
            const args = ['arg1', 'arg2'];
            const job = new Job(clientSock, 'foo', args);

            queue.queue.push(job);
            encodeStub.withArgs('bar').returns('baz');
            client.foo.callsFake((...testArgs) => {
                assert.deepEqual(testArgs, args);
                assert(queue.working);

                return Promise.resolve('bar');
            });

            return queue.process().then(() => {
                assert(client.foo.calledOnce);
                assert(client.foo.calledWith(...args));
                assert(encodeStub.calledOnce);
                assert(encodeStub.calledWith('bar'));
                assert(clientSock.write.calledOnce);
                assert(clientSock.write.calledWith('baz'));
                assert(!queue.working);
            });
        });

        it('calls redis client and return errors if failed', () => {
            const args = ['arg1', 'arg2'];
            const job = new Job(clientSock, 'foo', args);
            const err = new Error('msg');

            queue.queue.push(job);
            client.foo.withArgs(...args).rejects(err);
            encodeStub.returns('baz');

            return queue.process().then(() => {
                assert(client.foo.calledOnce);
                assert(client.foo.calledWith(...args));
                assert(encodeStub.calledOnce);
                assert(encodeStub.calledWith(err));
                assert(clientSock.write.calledOnce);
                assert(clientSock.write.calledWith('baz'));
            });
        });

        it('invokes next process if there are still jobs in queue', (next) => {
            const args = ['arg1', 'arg2'];
            const args2 = ['arg3', 'arg4'];
            const job = new Job(clientSock, 'foo', args);
            const job2 = new Job(clientSock, 'foo', args2);

            queue.queue.push(job, job2);
            client.foo.withArgs(...args).resolves('bar');
            client.foo.withArgs(...args2).resolves('bar2');
            encodeStub.withArgs('bar').returns('baz');
            encodeStub.withArgs('bar2').returns('baz2');

            queue.process().then(() => {
                setTimeout(() => {
                    assert(client.foo.calledTwice);
                    assert(client.foo.firstCall.calledWith(...args));
                    assert(client.foo.secondCall.calledWith(...args2));
                    assert(encodeStub.calledTwice);
                    assert(encodeStub.firstCall.calledWith('bar'));
                    assert(encodeStub.secondCall.calledWith('bar2'));
                    assert(clientSock.write.calledTwice);
                    assert(clientSock.write.firstCall.calledWith('baz'));
                    assert(clientSock.write.secondCall.calledWith('baz2'));
                    next();
                }, 10);
            });
        });
    });
});

describe('Job', () => {
    describe('command', () => {
        it('returns a command after lowercased', () => {
            const args = ['arg1', 'arg2'];
            const job = new Job('client', 'COMmanD', args);

            assert.equal(job.command, 'command');
            assert.equal(job.client, 'client');
            assert.equal(job.args, args);
        });
    })
});
