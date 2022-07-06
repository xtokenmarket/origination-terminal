const { ethers } = require("hardhat");

async function mockGraphData() {
  let originationPoolETHAddress = "0x7eb5794Cf2b441e39741f7676128e9c80F73423e";
  const originationPoolETH = await ethers.getContractAt("FungibleOriginationPool", originationPoolETHAddress);

  console.log("Offer token:", (await originationPoolETH.minContributionAmount()).toString());
  console.log("Reserve amounts:", (await originationPoolETH.reserveAmount()).toString());
  console.log("Purchase tokens acquired:", (await originationPoolETH.purchaseTokensAcquired()).toString());
  // console.log("Offer token decimals:", (await originationPoolETH.offerToken()).toString());
}

mockGraphData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
