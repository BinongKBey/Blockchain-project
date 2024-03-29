const sha256 = require("sha256");
const nodeUrl = process.argv[3];
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");
const e = require("express");
var configDir = './database/config';
var chainsDir = './database/chains';

class Transaction {
  constructor(name, aadhaar, institution, record, serverKeys, id) {
    this.name = name;
    this.aadhaar = aadhaar;
    this.institution = institution;
    this.record = record;
    this.serverKeys = serverKeys
    this.id = id;
  }
};

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
    this.chain = this.initChainFile();
    this.pendingTransactions = [];
    this.nodeUrl = nodeUrl;
    this.networkNodes = [];
    if (this.chain.length == 0) {
      this.creatNewBlock(100, "0", "Genesis block");
    }
  }

  initChainFile() {
    this.chainFileName = "chainData"
    const chainFileExists = fs.existsSync(path.join(__dirname, "../database/chains", `${this.chainFileName}.json`));
    if (!chainFileExists) {
      if (!fs.existsSync(chainsDir)) {
        fs.mkdirSync(chainsDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(__dirname, "../database/chains", `${this.chainFileName}.json`),
        JSON.stringify([])
      );
      return this.syncChainState();
    } else {
      return this.syncChainState();
    }
  }
  syncChainState() {
    this.chain = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../database/chains", `${this.chainFileName}.json`))
    );
    return this.chain;
  }

  creatNewBlock(nonce, prevBlockHash, hash) {
    const chain = this.syncChainState();

    const newBlock = new Block(
      chain.length + 1,
      Date.now(),
      nonce,
      prevBlockHash,
      hash,
      this.pendingTransactions
    );

    this.pendingTransactions = [];

    chain.push(newBlock);

    fs.writeFileSync(
      path.join(__dirname, "../database/chains", `${this.chainFileName}.json`),
      JSON.stringify(chain)
    );
    this.syncChainState();

    return newBlock;
  }
  getLatestBlock() {
    const chain = this.syncChainState();
    return chain[chain.length - 1];
  }
  makeNewTransaction(name, aadhaar, institution, record, serverKeys) {
    let id = uuid().split("-").join("")
    const transaction = new Transaction(name, aadhaar, institution, record, serverKeys, id);
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

    while (hash.substring(0, 2) !== "00") {
      nonce++;
      hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);
    }

    return nonce;
  }
  isChainValid(blockchain) {
    const genesisBlock = blockchain[0];
    if (
      genesisBlock.nonce !== 100 ||
      genesisBlock.hash !== "Genesis block" ||
      genesisBlock.prevBlockHash !== "0" ||
      genesisBlock.transactions.length !== 0
    ) {
      return false;
    }

    for (let i = 1; i < blockchain.length; i++) {
      const currentBlock = blockchain[i];
      const previousBlock = blockchain[i - 1];

      const currentBlockData = {
        transactions: currentBlock.transactions,
        index: currentBlock.index,
      };
      const blockHash = this.hashBlock(previousBlock.hash, currentBlockData, currentBlock.nonce);

      if (blockHash.substring(0, 2) !== "00") {
        return false;
      }

      console.log("previousHash: ", previousBlock.hash);
      console.log("currentHash: ", currentBlock.hash);
      console.log("---------------");
      if (currentBlock.prevBlockHash !== previousBlock.hash) {
        return false;
      }
    }

    return true;
  }
  findBlockByHash(hash) {
    let result = null;
    const chain = this.syncChainState();

    chain.forEach((block) => {
      if (block.hash === hash) {
        result = block;
      }
    });

    return result;
  }
  findTransactionById(id) {
    let result = null;
    const chain = this.syncChainState();

    chain.forEach((block) => {
      block.transactions.forEach((transaction) => {
        if (transaction.id === id) {
          result = {
            transaction: transaction,
            block: block,
          };
        }
      });
    });

    return result;
  }
  findTransactionsByAadhaar(aadhaar) {
    let transactions = [];
    const chain = this.syncChainState();

    chain.forEach((block) => {
      block.transactions.forEach((transaction) => {
        if (transaction.issuerAadhaarId === aadhaar || transaction.recipientAadhaarId === aadhaar) {
          transactions.push(transaction);
        }
      });
    });

    return {
      transactions: transactions,
    };
  }
}

module.exports = Blockchain;
