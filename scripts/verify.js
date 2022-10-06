const { ethers } = require("hardhat");
const { verifyContractWithArgsAndName, verifyContractWithArgs, verifyContractNoArgs } = require("./helpers");

async function verify() {
  const deployment = require("./deployment_goerli.json");
  const [user] = await ethers.getSigners();

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

  try {
    await verifyContractNoArgs(deployment.vestingEntryNFTImpl);
  } catch (err) {
    console.log(err);
  }
}

verify();
