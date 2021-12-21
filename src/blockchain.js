const sha256 = require("sha256");
const nodeUrl = process.argv[3];
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");
const e = require("express");
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
    this.creatNewBlock(100, "0", "Genesis block");
  }

  initChainFile() {
    const configExists = fs.existsSync(`../database/config/config.json`);
    if (!configExists) {
      fs.writeFileSync(
        path.join(__dirname, "../database/config", `config.json`),
        JSON.stringify({})
      );
    }

    const config = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../database/config", `config.json`))
    );
    if (config[nodeUrl]) {
      this.chainFileName = config[nodeUrl];
    } else {
      this.chainFileName = uuid();
      config[nodeUrl] = this.chainFileName;
      fs.writeFileSync(
        path.join(__dirname, "../database/config", `config.json`),
        JSON.stringify(config)
      );
    }

    const chainFileExists = fs.existsSync(`../database/chains/${this.chainFileName}.json`);
    if (!chainFileExists) {
      //   const createStream = fs.createWriteStream(`../database/chains/${this.chainFileName}.json`);
      //   createStream.end();
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
  makeNewTransaction(land, issuer, issuerAadhaarId, recipient, recipientAadhaarId) {
    const transaction = {
      land: land,
      issuer: issuer,
      issuerAadhaarId: issuerAadhaarId,
      recipient: recipient,
      recipientAadhaarId: recipientAadhaarId,
      id: uuid().split("-").join(""),
    };
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
