'use strict';

const ioredis = require('ioredis');
const nopTransformer = (args) => args;

// ioredis translates reply from array to object for hgetall
// This overrides the translation to nop
ioredis.Command.setReplyTransformer('hgetall', nopTransformer);

class ClusterClient extends ioredis.Cluster {
    constructor(upstreams, config) {
        super(upstreams, config);
    }

    static createClient(port, node, config) {
        return new ClusterClient( [ { host: node, port } ], config);
    }

    async keys(key){
        const masters = await this.nodes('master');
        const promises = masters.map(node => node.keys(key));

        const result = {};
        const resultArray = await Promise.all(promises);

        //uniq
        resultArray.forEach(arr => {
            arr.forEach(v => {
                result[v] = true;
            });
        });

        return Object.keys(result);
    }

    async scan(...args) {
        // command:  [ 'scan', 'O', 'match', 'resque-test-1:worker:ping:*' ]
        const [ cursor, match, pattern ] = args;
        let results;

        if (match && match.toLowerCase() === 'match') {
            results = await this.keys(pattern);
        } else {
            // TODO: parse COUNT option?
            results = await this.keys('*');
        }

        // 0: no more results
        return ['0', results];
    }

    async del(...keys) {
        const promises = keys.map(key => super.del(key));

        return Promise.all(promises).then((results) => {
            return results.reduce((r, v) => r + v, 0);
        });
    }

    async mget(...args) {
        const promises = args.map(key => super.mget(key));

        return Promise.all(promises).then((results) => {
            let result = [];

            results.forEach((d) => {
                result = result.concat(d);
            });

            return result;
        });
    }

    async mset(...args) {
        const promises = [];

        for(let i=0; i<args.length; i+=2) {
            promises.push(super.mset(args[i], args[i + 1]));
        }

        return Promise.all(promises).then((results) => {
            let result = [];

            results.forEach((d) => {
                result = result.concat(d);
            });

            return result;
        }).catch((err) => {
            // TODO: throw error
            console.log("mget", err);
            return Array(args.length).fill(null);
        });
    }

    async flushall() {
        const masters = await this.nodes('master');
        const promises = masters.map(node => node.flushall());

        try {
            await Promise.all(promises);
        } catch (e) {
            console.log(e);
            throw e;
        }

        return 'OK';
    }

    async select() {
        // Redis Cluster only supports database 0
        return super.select(0);
    }

    async auth(pass) {
        console.log(`PASS: ${pass}`);
        const isAuth = await super.auth(pass);
        console.log("isAuth: " + isAuth);
        return isAuth;
    }
}

module.exports = ClusterClient;
