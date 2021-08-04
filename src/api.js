const express = require('express');
const app = express();
const { v4: uuid } = require('uuid');
const nodeAddr = uuid();
const fetch = require('node-fetch');

const Blockchain = require('../src/blockchain');
const bitcoin = new Blockchain();

const currNodeUrl = process.argv[3];

app.use(express.json())

// Get Blockchain Details of current node
app.get('/blockchain', function (req, res) {
    res.send(bitcoin);
});

app.post('/transaction', function (req, res) {
    const transaction = req.body;
    const blockIndex = bitcoin.addTransactionToPendingTransactions(transaction);

    res.json(
        {
            message: `Transaction will be added to block with index: ${blockIndex}`
        }
    );
});

app.post('/transaction/broadcast', function (req, res) {
    const transaction = bitcoin.makeNewTransaction(
        req.body.amount,
        req.body.sender,
        req.body.recipient
    );
    bitcoin.addTransactionToPendingTransactions(transaction);

    const requests = [];
    bitcoin.networkNodes.forEach(networkNode => {
        const uri = networkNode + '/transaction';

        const requestOptions = {
            method: 'POST',
            body: JSON.stringify(transaction),
            headers: { 'Content-Type': 'application/json' },
        }
        requests.push(fetch(uri, requestOptions));
    });

    Promise.all(requests)
        .then(data => {
            res.json(
                {
                    message: `Creating and broadcasting Transaction successfully!`
                }
            );
        });
});

app.post('/add-block', function (req, res) {
    const block = req.body.newBlock;
    const latestBlock = bitcoin.getLatestBlock();

    if ((latestBlock.hash === block.prevBlockHash)
        && (block.index === latestBlock.index + 1)) {
        bitcoin.chain.push(block);
        bitcoin.pendingTransactions = [];

        res.json(
            {
                message: 'Add new Block successfully!',
                newBlock: block
            }
        );
    } else {
        res.json(
            {
                message: 'Cannot add new Block!',
                newBlock: block
            }
        );
    }
});

// Mine a block
app.get('/mine', function (req, res) {
    const latestBlock = bitcoin.getLatestBlock();
    const prevBlockHash = latestBlock.hash;
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: latestBlock.index + 1
    }
    const nonce = bitcoin.proofOfWork(prevBlockHash, currentBlockData);
    const blockHash = bitcoin.hashBlock(prevBlockHash, currentBlockData, nonce);

    const newBlock = bitcoin.creatNewBlock(nonce, prevBlockHash, blockHash)

    const requests = [];
    bitcoin.networkNodes.forEach(networkNode => {
        const uri = networkNode + '/add-block';

        const requestOptions = {
            method: 'POST',
            body: JSON.stringify({ newBlock: newBlock }),
            headers: { 'Content-Type': 'application/json' },
        }
        requests.push(fetch(uri, requestOptions));
    });

    Promise.all(requests)
        .then(data => {
            // reward for mining
            const uri = bitcoin.nodeUrl + '/transaction/broadcast'
            const requestOptions = {
                method: 'POST',
                body: JSON.stringify({
                    amount: 1,
                    sender: '00000',
                    recipient: nodeAddr
                }),
                headers: { 'Content-Type': 'application/json' },
            }
            return fetch(uri, requestOptions);
        })
        .then(data => {
            res.json(
                {
                    message: 'Mining & broadcasting new Block successfully!',
                    newBlock: newBlock
                }
            );
        });
});

// Register a node (used in register and broadcast node)
app.post('/register-node', function (req, res) {
    const nodeUrl = req.body.nodeUrl;

    if ((bitcoin.networkNodes.indexOf(nodeUrl) == -1)
        && (bitcoin.nodeUrl !== nodeUrl)) {
        bitcoin.networkNodes.push(nodeUrl);

        res.json(
            {
                message: 'A node registers successfully!'
            }
        );
    }
    else {
        res.json(
            {
                message: 'This node cannot register!'
            }
        );
    }
})

// Register bulk nodes to current node (used in register and broadcast node)
app.post('/register-bulk-nodes', function (req, res) {
    const networkNodes = req.body.networkNodes;

    networkNodes.forEach(nodeUrl => {
        if ((bitcoin.networkNodes.indexOf(nodeUrl) == -1)
            && (bitcoin.nodeUrl !== nodeUrl)) {
            bitcoin.networkNodes.push(nodeUrl);
        }
    });

    res.json(
        {
            message: 'Registering bulk successfully!'
        }
    );
})

// Register a node and broadcast it to all nodes, then add all network nodes to that node 
app.post('/register-and-broadcast-node', function (req, res) {
    const nodeUrl = req.body.nodeUrl;

    // Original
    // if (bitcoin.networkNodes.indexOf(nodeUrl) == -1 && nodeUrl !== currNodeUrl) {
    //     bitcoin.networkNodes.push(nodeUrl);
    // }

    // My Edit
    if (bitcoin.networkNodes.indexOf(nodeUrl) == -1 && nodeUrl !== currNodeUrl) {
        bitcoin.networkNodes.push(nodeUrl);
    }
    else {
        res.json(
            {
                message: 'Node already registered!'
            }
        );
    }

    const registerNodes = [];
    bitcoin.networkNodes.forEach(networkNode => {
        const uri = networkNode + '/register-node'
        const requestOptions = {
            method: 'POST',
            body: JSON.stringify({ nodeUrl: nodeUrl }),
            headers: { 'Content-Type': 'application/json' },
        }

        registerNodes.push(fetch(uri, requestOptions));
    });
    Promise.all(registerNodes)
        .then(data => {
            const uri = nodeUrl + '/register-bulk-nodes'
            const bulkRegisterOptions = {
                method: 'POST',
                body: JSON.stringify({ networkNodes: [...bitcoin.networkNodes, bitcoin.nodeUrl] }),
                headers: { 'Content-Type': 'application/json' },
            }

            return fetch(uri, bulkRegisterOptions);
        }).then(data => {
            res.json(
                {
                    message: 'A node registers with network successfully!'
                }
            );
        });
})

// api.js
const port = process.argv[2];
app.listen(port, function () {
    console.log(`> listening on port ${port}...`);
});

// blockchain.js
const nodeUrl = process.argv[3];