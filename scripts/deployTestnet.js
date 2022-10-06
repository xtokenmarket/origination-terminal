const { ethers } = require("hardhat");
const fs = require("fs");
const { deploy, deployArgs, verifyContractNoArgs, verifyContractWithArgs, verifyContractWithArgsAndName } = require("./helpers");

async function deployTestnet() {
  const [deployer, user] = await ethers.getSigners();
  console.log("deploying Origination contracts from", deployer.address);

  // deploy fungible origination pool implementation
  const originationPoolImpl = await deploy("FungibleOriginationPool");
  await originationPoolImpl.deployed();
  // deploy vestingEntryNFT
  const vestingEntryNFT = await deploy("VestingEntryNFT");
  await vestingEntryNFT.deployed();

  const xTokenManager = await deploy("MockxTokenManager");
  await xTokenManager.deployed();
  // set deployer as the revenue controller
  await (await xTokenManager.setRevenueController(deployer.address)).wait();
  console.log("deployed xtk manager");

  // deploy pool deployer
  const poolDeployer = await deployArgs("PoolDeployer", originationPoolImpl.address);
  await poolDeployer.deployed();
  console.log("deployed pool deployer");
  // deploy nft deployer
  const nftDeployer = await deployArgs("NFTDeployer", vestingEntryNFT.address);
  await nftDeployer.deployed();

  // deploy origination proxy admin
  const proxyAdmin = await deploy("OriginationProxyAdmin");
  await proxyAdmin.deployed();

  // deploy origination core
  const listingFee = ethers.utils.parseEther("0.1"); // 0.1 eth
  const originationFee = ethers.utils.parseEther("0.01"); // 1%
  const originationCoreImpl = await deploy("OriginationCore");
  await originationCoreImpl.deployed();
  console.log("deployed origination core");

  const originationCoreProxy = await deployArgs("OriginationCoreProxy", originationCoreImpl.address, user.address);
  await originationCoreProxy.deployed();
  console.log("deployed origination core proxy");

  // transfer proxy admin ownership to origination core
  await (await proxyAdmin.transferOwnership(originationCoreProxy.address)).wait();

  // initialize origination core
  const originationCore = await ethers.getContractAt("OriginationCore", originationCoreProxy.address);
  await (
    await originationCore.initialize(listingFee, originationFee, xTokenManager.address, poolDeployer.address, nftDeployer.address, proxyAdmin.address)
  ).wait();

  let originationProxyAdmin = await originationCore.proxyAdmin();

  const deployment = {
    originationCore: originationCoreProxy.address,
    originationProxyAdmin: originationProxyAdmin,
    originationPoolImpl: originationPoolImpl.address,
    originationCoreImpl: originationCoreImpl.address,
    vestingEntryNFTImpl: vestingEntryNFT.address,
    xTokenManager: xTokenManager.address,
    poolDeployer: poolDeployer.address,
    nftDeployer: nftDeployer.address,
  };

  fs.writeFileSync("./deployments/goerli.json", JSON.stringify(deployment));

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
    await verifyContractNoArgs(deployment.xTokenManager);
  } catch (err) {
    console.log(err);
  }
  try {
    await verifyContractNoArgs(deployment.originationProxyAdmin);
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
    await verifyContractWithArgsAndName(deployment.originationCore, originationCoreProxyName, deployment.originationCoreImpl, user.address);
  } catch (err) {
    console.log(err);
  }

  try {
    await verifyContractWithArgs(deployment.nftDeployer, deployment.vestingEntryNFTImpl);
  } catch (err) {
    console.log(err);
  }
}

deployTestnet();
