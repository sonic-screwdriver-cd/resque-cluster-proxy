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
            //password: config.redis.password,
            clusterRetryStrategy: (times) => 100,
            showFriendlyErrorStack: true,
            lazyConnect: true
        }
    });


    return cluster;
}



const server = net.createServer(async (client) => {
    const resp = new Resp();
    const cluster = createClusterClient();
    const queue = new Queue(cluster);

    cluster.on('error', (err) => {
        console.log('redis error:', err);
        client.write(Protocol.encode(err));
    });
    
    client.on('connect', () => {
        console.log('SERVER EVNET: CONNECTING');
    });

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
            console.log(`COMMAND: ${command} \t DATA: ${d}`)
            queue.enqueue(new Job(client, command, d));
        }
    });
});

server.listen(config.port, () => {
    console.log(`Listening on ${config.port}`);
});
