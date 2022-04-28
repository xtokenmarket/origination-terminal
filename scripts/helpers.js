const { ethers } = require('hardhat');

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


module.exports = { deploy, deployArgs, deployWithAbi, deployAndLink,
                    verifyContractNoArgs, verifyContractWithArgs, verifyContractWithArgsAndName,
                    increaseTime, mineBlocks, setBalance
                }