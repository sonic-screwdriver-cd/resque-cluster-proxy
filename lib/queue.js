'use strict';

const Protocol = require('./protocol');

let id = 0;

class Queue {
    constructor(clusterClient) {
        this.clusterClient = clusterClient;
        this.queue = [];
        this.working = false;
        this.id = id++;

        this.clusterClient.on('ready', () => {
            this.process();
        });
    }

    enqueue(job) {
        this.queue.push(job);

        if (!this.working && this.clusterClient.status === 'ready') {
            setImmediate(this.process.bind(this));
        }
    }

    async process() {
        if (this.queue.length === 0 || this.working) {
            return;
        }

        this.working = true;

        const job = this.queue.shift();
        let buf;
        let result;

        try {
            result = await this.clusterClient[job.command](...job.args);
        } catch(e) {
            result = e;
        }

        buf = Protocol.encode(result);
        // TODO: error handling
        // This occurs if an invalid password.
        job.client.write(buf);

        this.working = false;

        if (this.queue.length > 0) {
            setImmediate(this.process.bind(this));
        }
    }
}

class Job {
    constructor(client, command, args) {
        this._client = client;
        this._command = command.toLowerCase();
        this._args = args;
    }

    get client() {
        return this._client;
    }

    get command() {
        return this._command;
    }

    get args() {
        return this._args;
    }
}

module.exports = {
    Queue,
    Job
}
