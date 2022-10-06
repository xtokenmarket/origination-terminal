const { ethers, web3 } = require('hardhat');
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')

/**
 * Deploy a contract by name without constructor arguments
 */
 async function deploy(contractName) {
    let Contract = await ethers.getContractFactory(contractName);
    return await Contract.deploy({gasLimit: 8888888});
}

/**
 * Deploy a contract by name with constructor arguments
 */
async function deployArgs(contractName, ...args) {
    let Contract = await ethers.getContractFactory(contractName);
    return await Contract.deploy(...args, {gasLimit: 8888888});
}

/**
 * Deploy a contract with abi
 */
 async function deployWithAbi(contract, deployer, ...args) {
    let Factory = new ethers.ContractFactory(contract.abi, contract.bytecode, deployer);
    return await Factory.deploy(...args, {gasLimit: 8888888});
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
    return await Contract.deploy({gasLimit: 8888888});
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
      amount.toHexString().replace("0x0", "0x"),
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
 * Get ETH Balance of contract
 * @param {ethers.Contract} contract 
 */
 async function getBalance(contract) {
    return await contract.provider.getBalance(contract.address);
}

/**
 * Deploys ERC20 Origination offering having the specified price and with the purchase and offer token having the specified units
 * @param {number} offerTokenUnits number of offer token decimals  
 * @param {number} purchaseTokenUnits number of purchase token decimals  
 * @param {number} priceStringified offer token price stringified 
 * @returns  
 */

const deployERC20Offering = async (offerTokenUnits, purchaseTokenUnits, priceStringified) => {
    const [deployer, user, user1] = await ethers.getSigners();
    // set up purchase token and offer token
    const purchaseToken = await deployArgs("MockERC20", "Purchase", "PRCH", purchaseTokenUnits);
    const offerToken = await deployArgs("MockERC20", "Offer", "OFFR", offerTokenUnits);
  
    // token transfers
    await purchaseToken.transfer(user.address, ethers.utils.parseUnits("1000000", purchaseTokenUnits));
    await purchaseToken.transfer(user1.address, ethers.utils.parseUnits("1000000", purchaseTokenUnits));
  
    // deploy fungible origination pool implementation
    const originationPoolImpl = await deploy("FungibleOriginationPool");
    // deploy vesting entry nft implementation
    const vestingEntryNFTImpl = await deploy("VestingEntryNFT");
  
    const xTokenManager = await deploy("MockxTokenManager");
    // set deployer as the revenue controller
    await xTokenManager.setRevenueController(deployer.address);
  
    // Deploy origination proxy admin
    const proxyAdmin = await deploy("OriginationProxyAdmin");
  
    // deploy pool deployer
    const poolDeployer = await deployArgs("PoolDeployer", originationPoolImpl.address);
  
    // deploy vesting entry nft deployer
    const nftDeployer = await deployArgs("NFTDeployer", vestingEntryNFTImpl.address);
  
    // deploy origination core
    const listingFee = ethers.utils.parseEther("0.01"); // 1 %
    const originationFee = ethers.utils.parseEther("0.01");
    const originationCoreImpl = await deploy("OriginationCore");
  
    const originationCoreProxy = await deployArgs("OriginationCoreProxy", originationCoreImpl.address, user.address);
    const originationCore = await ethers.getContractAt("OriginationCore", originationCoreProxy.address);
    await originationCore.initialize(listingFee, originationFee, xTokenManager.address, poolDeployer.address, nftDeployer.address, proxyAdmin.address);
    await proxyAdmin.transferOwnership(originationCore.address);
  
    // token sale parameters
    const offerPricePerPurchaseToken = ethers.utils.parseUnits(priceStringified, purchaseTokenUnits);
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", offerTokenUnits); // selling a total of 1m
    const saleThreshold = ethers.utils.parseEther("1");
    const vestingPeriod = 0; // no vesting period
    const cliffPeriod = 0; // no cliff period
    const whitelistStartingPrice = 0;
    const whitelistEndingPrice = 0;
    const publicSaleDuration = 86400; // duration of 24 hours
    const whitelistSaleDuration = 0; // duration of 24 hours
  
    // ***deploy test case where purchase token are not ETH
    // create listing
    tx = await originationCore.createFungibleListing(
      {
        offerToken: offerToken.address,
        purchaseToken: purchaseToken.address,
        publicStartingPrice: offerPricePerPurchaseToken, // starting price
        publicEndingPrice: offerPricePerPurchaseToken, // ending price
        whitelistStartingPrice: whitelistStartingPrice,
        whitelistEndingPrice: whitelistEndingPrice,
        publicSaleDuration: publicSaleDuration,
        whitelistSaleDuration: whitelistSaleDuration,
        totalOfferingAmount: totalOfferingAmount,
        reserveAmount: saleThreshold,
        vestingPeriod: vestingPeriod,
        cliffPeriod: cliffPeriod,
      },
      { value: listingFee }
    );
  
    // listing to event for pool address
    let receipt = await tx.wait();
    let eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
    let originationPoolAddress = eventListing.args[0];
  
    const originationPool = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  
    await purchaseToken.approve(originationPool.address, ethers.utils.parseUnits("10000000000", purchaseTokenUnits));
    await purchaseToken.connect(user).approve(originationPool.address, ethers.utils.parseUnits("10000000000", purchaseTokenUnits));
    await offerToken.approve(originationPool.address, ethers.utils.parseUnits("10000000000", offerTokenUnits));
    await offerToken.connect(user).approve(originationPool.address, ethers.utils.parseUnits("10000000000", offerTokenUnits));
  
    await originationPool.initiateSale();
    await network.provider.send("evm_mine");
    
    return originationPool;
  };

module.exports = { deploy, deployArgs, deployWithAbi, deployAndLink,
                    verifyContractNoArgs, verifyContractWithArgs, verifyContractWithArgsAndName,
                    increaseTime, mineBlocks, setBalance, getMerkleTree, getMerkleProofs,
                    getMerkleWhitelist, bn, bnDecimal, bnDecimals, getEmptyBytes,
                    getBalance, deployERC20Offering
                }