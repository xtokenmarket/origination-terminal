const { ethers } = require("hardhat");
const fs = require("fs");
const { deploy, deployArgs, verifyContractNoArgs, verifyContractWithArgs, verifyContractWithArgsAndName } = require("./helpers");

const addresses = require('./managementAddresses.json');

deployMainnet('polygon')
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
});


async function deployMainnet(network) {
  const [deployer, user] = await ethers.getSigners();
  console.log("deploying Origination contracts on", network, "from", deployer.address);

  let xTokenProxyAdmin = addresses[network].ProxyAdmin;
  let xTokenManager = addresses[network].xTokenManager;
  let multisig = addresses[network].Multisig

  // deploy fungible origination pool implementation
  const originationPoolImpl = await deploy("FungibleOriginationPool");
  await originationPoolImpl.deployed();
  // deploy vestingEntryNFT
  const vestingEntryNFT = await deploy("VestingEntryNFT");
  await vestingEntryNFT.deployed();
  console.log("deployed vesting entry nft");

  // deploy pool deployer
  const poolDeployer = await deployArgs("PoolDeployer", originationPoolImpl.address);
  await poolDeployer.deployed();
  console.log("deployed pool deployer");
  // deploy nft deployer
  const nftDeployer = await deployArgs("NFTDeployer", vestingEntryNFT.address);
  await nftDeployer.deployed();
  console.log("deployed nft deployer");

  // deploy origination proxy admin
  const proxyAdmin = await deploy("OriginationProxyAdmin");
  await proxyAdmin.deployed();
  console.log("deployed origination proxy admin");

  // deploy origination core
  const listingFee = network == "polygon" ? ethers.utils.parseEther("800") : // 800 MATIC
                                            ethers.utils.parseEther("0.5") // 0.5 ETH
  const originationFee = ethers.utils.parseEther("0.005"); // 0.5%
  const originationCoreImpl = await deploy("OriginationCore");
  await originationCoreImpl.deployed();
  console.log("deployed origination core");

  const originationCoreProxy = await deployArgs("OriginationCoreProxy", originationCoreImpl.address, xTokenProxyAdmin);
  await originationCoreProxy.deployed();
  console.log("deployed origination core proxy");

  // transfer proxy admin ownership to origination core
  await (await proxyAdmin.transferOwnership(originationCoreProxy.address)).wait();
  console.log("transferred proxy admin ownership to origination core");

  // initialize origination core
  const originationCore = await ethers.getContractAt("OriginationCore", originationCoreProxy.address);
  await (
    await originationCore.initialize(listingFee, originationFee, xTokenManager, poolDeployer.address, nftDeployer.address, proxyAdmin.address)
  ).wait();
  console.log("initialized origination core");

  await (await originationCore.transferOwnership(multisig)).wait();
  console.log('transferred ownership of origination core to xtoken multisig')
  await (await poolDeployer.transferOwnership(multisig)).wait();
  console.log('transferred ownership of pool deployer to xtoken multisig')

  let originationProxyAdmin = await originationCore.proxyAdmin();

  const deployment = {
    originationCore: originationCoreProxy.address,
    originationProxyAdmin: originationProxyAdmin,
    originationPoolImpl: originationPoolImpl.address,
    originationCoreImpl: originationCoreImpl.address,
    vestingEntryNFTImpl: vestingEntryNFT.address,
    poolDeployer: poolDeployer.address,
    nftDeployer: nftDeployer.address,
  };

  fs.writeFileSync(`./deployments/${network}.json`, JSON.stringify(deployment));

  try {
    await verifyContractNoArgs(deployment.originationPoolImpl);
  } catch (err) {
    console.log(err);
  }
  try {
    await verifyContractNoArgs(deployment.originationCoreImpl);
  } catch (err) {
    console.log(err);
  }
  try {
    await verifyContractNoArgs(deployment.originationProxyAdmin);
  } catch (err) {
    console.log(err);
  }
  try {
    await verifyContractNoArgs(deployment.vestingEntryNFTImpl);
  } catch (err) {
    console.log(err);
  }

  try {
    await verifyContractWithArgs(deployment.poolDeployer, deployment.originationPoolImpl);
  } catch (err) {
    console.log(err);
  }

  let originationCoreProxyName = "contracts/proxies/OriginationCoreProxy.sol:OriginationCoreProxy";
  try {
    await verifyContractWithArgsAndName(deployment.originationCore, originationCoreProxyName, deployment.originationCoreImpl, xTokenProxyAdmin);
  } catch (err) {
    console.log(err);
  }

  try {
    await verifyContractWithArgs(deployment.nftDeployer, deployment.vestingEntryNFTImpl);
  } catch (err) {
    console.log(err);
  }
}
