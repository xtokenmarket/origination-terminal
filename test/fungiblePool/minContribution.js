const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceTime, getEvmSnapshot, revertEvm } = require("../utils");

const { deployArgs, deploy } = require("../../scripts/helpers");
const { BigNumber } = require("ethers");

const deployPool = async (offerTokenUnits, purchaseTokenUnits, priceStringified) => {
  const [deployer, user, user1] = await ethers.getSigners();
  // set up purchase token and offer token
  const purchaseToken = await deployArgs("MockERC20", "Purchase", "PRCH", purchaseTokenUnits);
  const offerToken = await deployArgs("MockERC20", "Offer", "OFFR", offerTokenUnits);

  // token transfers
  await purchaseToken.transfer(user.address, ethers.utils.parseUnits("1000000", purchaseTokenUnits));
  await purchaseToken.transfer(user1.address, ethers.utils.parseUnits("1000000", purchaseTokenUnits));

  // deploy fungible origination pool implementation
  const originationPoolImpl = await deploy("FungibleOriginationPool");
  // deploy non-fungible origination pool implementation
  const nonFungibleOriginationPoolImpl = await deploy("NonFungibleOriginationPool");
  // deploy vesting entry nft implementation
  const vestingEntryNFTImpl = await deploy("VestingEntryNFT");

  const xTokenManager = await deploy("MockxTokenManager");
  // set deployer as the revenue controller
  await xTokenManager.setRevenueController(deployer.address);

  // Deploy origination proxy admin
  const proxyAdmin = await deploy("OriginationProxyAdmin");

  // deploy pool deployer
  const poolDeployer = await deployArgs("PoolDeployer", originationPoolImpl.address, nonFungibleOriginationPoolImpl.address);

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
  await advanceTime(1);

  return originationPool;
};

const poolTokensDecimals = [8, 12, 18];

describe("Fungible token sale min contribution", async () => {
  let snapshotID;

  before(async () => {
    [deployer, user, user1] = await ethers.getSigners();
  });

  beforeEach(async () => {
    snapshotID = await getEvmSnapshot();
  });

  afterEach(async () => {
    await revertEvm(snapshotID);
  });

  for (const purchaseTokenDecimals of poolTokensDecimals) {
    for (const offerTokenDecimals of poolTokensDecimals) {
      it(`PRCH(${purchaseTokenDecimals} decimals);OFFR(${offerTokenDecimals} decimals);`, async () => {
        const originationPool = await deployPool(offerTokenDecimals, purchaseTokenDecimals, "1");
        const minContribution = BigNumber.from(10 ** (purchaseTokenDecimals / 2));

        expect(await originationPool.minContributionAmount()).to.eq(minContribution);

        // contribute with less than min contribution
        await expect(originationPool.purchase(minContribution.sub(1))).to.be.revertedWith("Need to contribute at least min contribution amount");

        // contribute with min contribution amount
        let expectedOfferTokenAmount = await originationPool.getCurrentMintAmount(minContribution);
        await originationPool.connect(user).purchase(minContribution);

        if (purchaseTokenDecimals - offerTokenDecimals > purchaseTokenDecimals / 2) {
          // the difference between Purchase Token decimals and Offer Token decimals
          // is too big for the min contribution to produce proper returns in terms of Offer Token

          // we expect a bigger contribution to return at least 1 wei
          // even in this case, the gas fees are way bigger than the returned amount
          expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(0);
          const amountIn = minContribution.mul(10 ** (purchaseTokenDecimals - offerTokenDecimals - purchaseTokenDecimals / 2));
          expect(await originationPool.getCurrentMintAmount(amountIn)).to.equal(1);

          console.log("\nMin contribution of", ethers.utils.formatUnits(minContribution, purchaseTokenDecimals), "PRCH mints 0 OFFR");
          console.log("Contribution of", ethers.utils.formatUnits(amountIn, purchaseTokenDecimals), "PRCH mints 1 weiOFFR\n");
          return;
        }

        expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(expectedOfferTokenAmount);
      });
    }
  }
});
