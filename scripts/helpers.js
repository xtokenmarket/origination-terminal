const { ethers, web3 } = require('hardhat');
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')

/**
 * Deploy a contract by name without constructor arguments
 */
 async function deploy(contractName) {
    let Contract = await ethers.getContractFactory(contractName);
    return await Contract.deploy();
}

/**
 * Deploy a contract by name with constructor arguments
 */
async function deployArgs(contractName, ...args) {
    let Contract = await ethers.getContractFactory(contractName);
    return await Contract.deploy(...args);
}

/**
 * Deploy a contract with abi
 */
 async function deployWithAbi(contract, deployer, ...args) {
    let Factory = new ethers.ContractFactory(contract.abi, contract.bytecode, deployer);
    return await Factory.deploy(...args);
}

/**
 * Deploy a contract by name without constructor arguments
 * Link contract to a library address
 */
 async function deployAndLink(contractName, libraryName, libraryAddress) {
    const params = {
        libraries: {
            [libraryName]: libraryAddress
        }
    }
    let Contract = await ethers.getContractFactory(contractName, params);
    return await Contract.deploy();
}



async function verifyContractNoArgs(address) {
    try {
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: [],
        });
    } catch (err) {
        console.log('error while verifying contract:', err);
    }
}

async function verifyContractWithArgs(address, ...args) {
    try {
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: [...args],
        });
    } catch (err) {
        console.log('error while verifying contract:', err);
    }
}

async function verifyContractWithArgsAndName(address, contractName, ...args) {
    try {
        await hre.run("verify:verify", {
            address: address,
            contract: contractName,
            constructorArguments: [...args],
        });
    } catch (err) {
        console.log('error while verifying contract:', err);
    }
}


/**
 * Increase time in Hardhat Network
 */
 async function increaseTime(time) {
    await network.provider.send("evm_increaseTime", [time]);
    await network.provider.send("evm_mine");
}



/**
 * Mine several blocks in network
 * @param {Number} blockCount how many blocks to mine
 */
 async function mineBlocks(blockCount) {
    for(let i = 0 ; i < blockCount ; ++i) {
        await network.provider.send("evm_mine");
    }
}

/**
 * Set an address ETH balance to an amount
 * @param {*} address 
 */
 async function setBalance(address, amount) {
    await network.provider.send("hardhat_setBalance", [
      address,
      amount.toHexString(),
    ]);
}

/**
 * Return BigNumber
 */
 function bn(amount) {
    return new ethers.BigNumber.from(amount);
}

/**
 * Returns bignumber scaled to 18 decimals
 */
function bnDecimal(amount) {
    let decimal = Math.pow(10, 18);
    let decimals = bn(decimal.toString());
    return bn(amount).mul(decimals);
}

function getEmptyBytes() {
    return ethers.utils.formatBytes32String('0');
}

/**
 * Returns bignumber scaled to custom amount of decimals
 */
 function bnDecimals(amount, _decimals) {
    let decimal = Math.pow(10, _decimals);
    let decimals = bn(decimal.toString());
    return bn(amount).mul(decimals);
}

/**
 * Return json object used to generate merkle tree
 * Object contains address -> max mintable amount for that address
 * @returns 
 */
async function getMerkleWhitelist() {
    let [deployer, user, user1, user2] = await ethers.getSigners();
    let whitelist = 
    {
        [deployer.address]: bnDecimal(10000),
        [user.address]: bnDecimal(1000),
        [user1.address]: bnDecimal(1000),
        [user2.address]: bnDecimal(1000)
    }
    return whitelist;
}

/**
 * Get merkle tree leaves from address and amount
 * keccak256(web3.encodePacked(address, amount))
 * @returns Array of hashes
 */
async function getMerkleTreeLeaves() {
    let whitelist = await getMerkleWhitelist();
    let addressMaxAmountHashes = [];
    // get list of leaves for the merkle trees using address and token balance
    // encode user address and balance using web3 encodePacked
    for (let address of Object.keys(whitelist)) {
      let hash = keccak256(web3.utils.encodePacked(address, whitelist[address]));
      addressMaxAmountHashes.push(hash);
    }
    return addressMaxAmountHashes;
}

/**
 * return test merkle tree with address and amount for each address
 * the amounts are the max mintable amounts for the address
 * Used for testing with the hardhat default addresses
 */
async function getMerkleTree() {
    let merkleTreeLeaves = await getMerkleTreeLeaves();
    // create merkle tree
    const merkleTree = new MerkleTree(merkleTreeLeaves, keccak256, {
      sortLeaves: true,
      sortPairs: true
    });
    
    return merkleTree;
}

/**
 * Get merkle tree proofs
 * @returns array of proofs for the merkle tree
 */
async function getMerkleProofs() {
    let merkleTreeLeaves = await getMerkleTreeLeaves();
    // create merkle tree
    const merkleTree = new MerkleTree(merkleTreeLeaves, keccak256, {
      sortLeaves: true,
      sortPairs: true
    });

    let proofs = [];
    for(let i = 0 ; i < merkleTreeLeaves.length ; ++i) {
        let proof = merkleTree.getHexProof(merkleTreeLeaves[i]);
        proofs.push(proof);
    }
    return proofs;
}

/**
 * Return array used to generate merkle tree for nft pools
 * Array contains whitelisted addresses
 * @returns 
 */
 async function getMerkleWhitelistNonFungible() {
    let [deployer, user, user1, user2] = await ethers.getSigners();
    let whitelist = [deployer.address, user.address, user1.address, user2.address];
    return whitelist;
}

/**
 * Get merkle tree leaves from addresses
 * Used in NonFungibleOriginationPool
 * keccak256(address)
 * @returns Array of hashes
 */
async function getMerkleTreeLeavesNonFungible() {
    let whitelist = await getMerkleWhitelistNonFungible();
    const hashes = whitelist.map((addr) => keccak256(addr));
    return hashes;
}

/**
 * return test merkle tree with addresses for nft pools
 * Used for testing with the hardhat default addresses
 */
async function getMerkleTreeNonFungible() {
    const merkleTreeLeaves = await getMerkleTreeLeavesNonFungible();

    const merkleTree = new MerkleTree(merkleTreeLeaves, keccak256, {
        sortPairs: true,
        sortLeaves: true
    });
      
    return merkleTree;
}

/**
 * Return merkle proofs for nft pools
 * Used for testing with hh default addresses
 * @returns 
 */
async function getMerkleProofsNonFungible() {
    let merkleTreeLeaves = await getMerkleTreeLeavesNonFungible();
    // create merkle tree
    const merkleTree = new MerkleTree(merkleTreeLeaves, keccak256, {
        sortPairs: true,
        sortLeaves: true
    });

    let proofs = [];
    for(let i = 0 ; i < merkleTreeLeaves.length ; ++i) {
        let proof = merkleTree.getHexProof(merkleTreeLeaves[i]);
        proofs.push(proof);
    }
    return proofs;
}


/**
 * Get ETH Balance of contract
 * @param {ethers.Contract} contract 
 */
 async function getBalance(contract) {
    return await contract.provider.getBalance(contract.address);
}


module.exports = { deploy, deployArgs, deployWithAbi, deployAndLink,
                    verifyContractNoArgs, verifyContractWithArgs, verifyContractWithArgsAndName,
                    increaseTime, mineBlocks, setBalance, getMerkleTree, getMerkleProofs,
                    getMerkleWhitelist, getMerkleTreeNonFungible, getMerkleProofsNonFungible,
                    getMerkleWhitelistNonFungible, bn, bnDecimal, bnDecimals, getEmptyBytes,
                    getBalance
                }