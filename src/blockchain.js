const sha256 = require('sha256');
const nodeUrl = process.argv[3];
const { v4: uuid } = require('uuid');
class Block {
    constructor(index, timestamp, nonce, prevBlockHash, hash, transactions) {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.nonce = nonce;
        this.hash = hash;
        this.prevBlockHash = prevBlockHash;
    }
}

class Blockchain {
    constructor() {
        this.chain = [];
        this.pendingTransactions = [];
        this.nodeUrl = nodeUrl;
        this.networkNodes = [];
        this.creatNewBlock(100, '0', 'Genesis block');
    }
    creatNewBlock(nonce, prevBlockHash, hash) {
        const newBlock = new Block(
            this.chain.length + 1,
            Date.now(),
            nonce,
            prevBlockHash,
            hash,
            this.pendingTransactions
        );

        this.pendingTransactions = [];
        this.chain.push(newBlock);

        return newBlock;
    }
    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }
    makeNewTransaction(amount, sender, recipient) {
        const transaction = {
            amount: amount,
            sender: sender,
            recipient: recipient,
            id: uuid().split('-').join('')
        }
        return transaction;
    }
    addTransactionToPendingTransactions(transaction) {
        this.pendingTransactions.push(transaction);
        return this.getLatestBlock().index + 1;
    }
    hashBlock(prevBlockHash, currentBlock, nonce) {
        const data = prevBlockHash + JSON.stringify(currentBlock) + nonce;
        const hash = sha256(data);
        return hash;
    }
    proofOfWork(prevBlockHash, currentBlockData) {
        let nonce = 0;
        let hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);

        while (hash.substring(0, 3) !== '000') {
            nonce++;
            hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);
        };

        return nonce;
    }
}

module.exports = Blockchain