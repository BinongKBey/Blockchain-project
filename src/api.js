const express = require('express');
const app = express();
const { v4: uuid } = require('uuid');
const nodeAddr = uuid();
const fetch = require('node-fetch');
const cors = require('cors');
const multer = require('multer');
const Blockchain = require('../src/blockchain');
const path = require('path')
var FormData = require('form-data');
const fs = require('fs');
const nacl = require('tweetnacl');
const { encryptText, decryptText } = require('./encrypt');
nacl.util = require('tweetnacl-util');
const download = require('download');

const bitcoin = new Blockchain();
const currNodeUrl = process.argv[3];

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../database', 'files'))
    },
    filename: function (req, file, cb) {
        let extArray = file.mimetype.split("/");
        let extension = extArray[extArray.length - 1];
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + extension)
    }
})

const upload = multer({ storage: storage })

const storage2 = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../database', 'files'))
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
})

const uploadBroadcast = multer({ storage: storage2 })

// app.post('/stats', upload.single('record'), function (req, res) {
// req.file is the name of your file in the form above, here 'uploaded_file'
// req.body will hold the text fields, if there were any 
// console.log(req.file, req.body)
//     res.send(req.file)
// });

// Get Blockchain Details of current node
app.get('/blockchain', function (req, res) {
    res.send(bitcoin);
});

// app.post('/sendFile',uploadBroadcast.array('record'))

app.get('/consensus', function (req, res) {
    const requests = [];
    bitcoin.networkNodes.forEach(nodeUrl => {
        const uri = nodeUrl + '/blockchain'
        const requestOptions = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        };
        requests.push(fetch(uri, requestOptions).then(data => data.json()));
    });

    Promise.all(requests).then(blockchains => {
        const currentChainLength = bitcoin.chain.length;
        let maxChainLength = currentChainLength;
        let longestChain = null;
        let pendingTransactions = null;
        let longChainUrl = nodeUrl

        blockchains.forEach(blockchain => {
            if (blockchain.chain.length > maxChainLength) {
                maxChainLength = blockchain.chain.length;
                longestChain = blockchain.chain;
                longChainUrl = blockchain.nodeUrl
                pendingTransactions = blockchain.pendingTransactions;
            }
        });

        if (!longestChain ||
            (longestChain && !bitcoin.isChainValid(longestChain))) {
            res.json({
                message: 'Current chain cannot be replaced!',
                chain: bitcoin.chain
            });
        } else if (longestChain && bitcoin.isChainValid(longestChain)) {
            bitcoin.chain = longestChain;
            const chainFileName = 'chainData';
            bitcoin.pendingTransactions = pendingTransactions;
            fs.writeFileSync(
                path.join(__dirname, "../database/chains", `${chainFileName}.json`),
                JSON.stringify(bitcoin.chain)
            );

            console.log(longChainUrl)
            if (bitcoin.chain.length > 1) {
                bitcoin.chain.forEach((eachChain) => {
                    if (eachChain.transactions.length > 0) {
                        eachChain.transactions.forEach((eachTransaction) => {
                            // Url
                            const file = longChainUrl + eachTransaction.record
                            const filePath = path.join(__dirname, "../database/files");
                            download(file, filePath)
                                .then(() => {
                                    console.log('Download Completed');
                                })
                        })
                    }
                })
            }
            res.json({
                message: 'Chain is updated!',
                chain: bitcoin.chain
            });
        }
    });
});

// For other node's transactions
app.post('/transaction', uploadBroadcast.single('record'), function (req, res) {
    const transaction = {
        name: req.body.name,
        aadhaar: req.body.aadhaar,
        institution: req.body.institution,
        record: '/database/files/' + req.file.filename,
        serverKeys: req.body.serverKeys
    };
    const blockIndex = bitcoin.addTransactionToPendingTransactions(transaction);

    res.json(
        {
            message: `Transaction will be added to block with index: ${blockIndex}`
        }
    );
});

// Main route for transactions
app.post('/transaction/broadcast', upload.single('record'), function (req, res) {
    const serverKeys = nacl.box.keyPair();
    const userKeys = nacl.box.keyPair();
    const one_time_code = nacl.randomBytes(24);

    const encrypted_name = encryptText(serverKeys, userKeys, req.body.name, one_time_code)
    const encrypted_aadhaar = encryptText(serverKeys, userKeys, req.body.aadhaar, one_time_code)
    const encrypted_institution = encryptText(serverKeys, userKeys, req.body.institution, one_time_code)

    const transaction = bitcoin.makeNewTransaction(
        encrypted_name,
        encrypted_aadhaar,
        encrypted_institution,
        '/database/files/' + req.file.filename,
        JSON.stringify(serverKeys)
    );
    bitcoin.addTransactionToPendingTransactions(transaction);
    const transactionForm = new FormData();
    transactionForm.append('name', encrypted_name);
    transactionForm.append('aadhaar', encrypted_aadhaar);
    transactionForm.append('institution', encrypted_institution);
    transactionForm.append('record', fs.createReadStream(path.join(__dirname, '../database', 'files', req.file.filename)));
    transactionForm.append('serverKeys', JSON.stringify(serverKeys));

    const requests = [];
    bitcoin.networkNodes.forEach(networkNode => {
        const uri = networkNode + '/transaction';

        const requestOptions = {
            method: 'POST',
            body: transactionForm,
            // headers: { 'Content-Type': 'multipart/form-data' },
        }
        requests.push(fetch(uri, requestOptions));
    });

    Promise.all(requests)
        .then(data => {
            res.json(
                {
                    message: `Creating and broadcasting Transaction successfully!\nPlease note down these details. They cannot be recovered if lost.`,
                    transactionId: transaction.id,
                    keys: userKeys
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
    let possible = false
    // My Edit
    if (bitcoin.networkNodes.indexOf(nodeUrl) == -1 && nodeUrl !== currNodeUrl) {
        possible = true
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
            if (possible) {
                bitcoin.networkNodes.push(nodeUrl);
            }
            res.json(
                {
                    message: 'A node registers with network successfully!'
                }
            );
        }).catch(err => {
            res.json({ error: "Node not available" })
        })
})


// Get Block By Hash
app.get('/block/:hash', function (req, res) {
    const hash = req.params.hash;
    const block = bitcoin.findBlockByHash(hash);

    res.json({
        block: block
    });
});

// Get transaction by id
app.post('/transaction/:id', function (req, res) {
    const id = req.params.id;
    const user = req.body;
    const transactionInfo = bitcoin.findTransactionById(id);
    const server = transactionInfo.transaction.serverKeys;

    const decryptedTransaction = {
        name: decryptText(server, user, transactionInfo.transaction.name),
        aadhaar: decryptText(server, user, transactionInfo.transaction.aadhaar),
        institution: decryptText(server, user, transactionInfo.transaction.institution),
        record: transactionInfo.transaction.record,
        id: transactionInfo.transaction.id,
    }
    if (transactionInfo !== null) {
        res.json({
            transaction: decryptedTransaction,
            // block: transactionInfo.block
        });
    } else {
        res.json({
            transaction: null
        });
    }
});

// Get Data related to user/aadhaarId
app.get('/aadhaar/:aadhaar', function (req, res) {
    const aadhaar = req.params.aadhaar;
    const data = bitcoin.findTransactionsByAadhaar(aadhaar);

    res.json({
        data: data
    });
});

// for download
app.get('/database/files/:filename', function (req, res) {
    res.download(path.join(__dirname, '..', 'database', 'files', req.params.filename))
})

// api.js
const port = process.argv[2];
app.listen(port, function () {
    console.log(`> listening on port ${port}...`);
});

// blockchain.js
const nodeUrl = process.argv[3];