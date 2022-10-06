require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("@openzeppelin/hardhat-upgrades");
// require('hardhat-contract-sizer');
require("solidity-coverage");

require("dotenv").config();

const alchemy = {
  mainnet: 'https://eth-mainnet.alchemyapi.io/v2/',
  arbitrum: 'https://arb-mainnet.g.alchemy.com/v2/',
  optimism: 'https://opt-mainnet.g.alchemy.com/v2/',
  polygon: 'https://polygon-mainnet.g.alchemy.com/v2/',
  goerli: 'https://eth-goerli.alchemyapi.io/v2/'
}

const key = process.env.ALCHEMY_KEY;
if(!key) {
  console.log('please set your ALCHEMY_KEY in .env');
  return;
}

module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: alchemy.mainnet + key,
        enabled: false,
        blockNumber: 14954700,
      },
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true,
    },
    mainnet: {
      url: alchemy.mainnet + key,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      gasPrice: 155000000000,
      gas: 2222222,
    },
    arbitrum: {
      url: alchemy.arbitrum + key,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY, process.env.ADMIN_2_PRIVATE_KEY],
      gas: 77777777,
      //gasPrice: 1000000000
    },
    optimism: {
      url: alchemy.optimism + key,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      // gasPrice: 44000000000, // 44 gwei
      gas: 15000000,
    },
    polygon: {
      url: alchemy.polygon + key,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      // gasPrice: 44000000000 // 44 gwei,
      gas: 8888888,
    },
    goerli: {
      url: alchemy.goerli + key,
      accounts: [process.env.ADMIN_PRIVATE_KEY, process.env.ADMIN_2_PRIVATE_KEY],
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    version: "0.8.15",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
  },
};
