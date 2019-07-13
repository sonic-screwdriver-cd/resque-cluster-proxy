const ClusterClient = require('./lib/client');
const Resp = require('respjs');
const net = require('net');
const port = 6379;
const Protocol = require('./lib/protocol');
const { Job, Queue } = require('./lib/queue');
const config = require('config');

const upstreams = config.redis.hosts;

function createClusterClient() {
    const cluster = new ClusterClient(upstreams, {
        redisOptions: {
            password: config.redis.password,
            clusterRetryStrategy: (times) => 100,
            showFriendlyErrorStack: true
        }
    });

    cluster.on('error', () => console.log('redis error'));

    return cluster;
}



const server = net.createServer(async (client) => {
    const resp = new Resp();
    const cluster = createClusterClient();
    const queue = new Queue(cluster);

    client.pipe(resp);

    //console.log('Client connected');
    client.on('end', () => {
        //console.log('Client disconnected');
        resp.end();
        cluster.quit();
    });

    client.on('error', (err) => {
        console.error('ClientError', err.message, err.stack);
        client.end();
        cluster.quit();
    });


    resp.on('error', (err) => {
        console.log(err);
        client.end();
        cluster.quit();
    });

    resp.on('data', async (d) => {
        if (d && d[0]) {
            const command = d.shift();
            queue.enqueue(new Job(client, command, d));
        }
    });
});

server.listen(config.port, () => {
    console.log(`Listening on ${config.port}`);
});
