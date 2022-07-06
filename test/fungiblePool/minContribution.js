const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceTime } = require("../utils");

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
  const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m
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

  return {
    priceStringified,
    offerTokenUnits,
    purchaseTokenUnits,
    originationPool,
  };
};

const getPools_OFFR_gte_PRCH = async (useLowPriceValue = false) => {
  const pools = [];

  for (let offerTokenUnits = 18; offerTokenUnits >= 6; offerTokenUnits -= 2) {
    for (let purchaseTokenUnits = 6; purchaseTokenUnits <= offerTokenUnits; purchaseTokenUnits += 2) {
      const pool = await deployPool(
        offerTokenUnits,
        purchaseTokenUnits,
        useLowPriceValue ? (1 / 10 ** purchaseTokenUnits).toFixed(purchaseTokenUnits) : "11.26"
      );
      pools.push(pool);
    }
  }

  return pools;
};

const getPools_OFFR_lt_PRCH = async (useLowPriceValue = false) => {
  const pools = [];

  for (let purchaseTokenUnits = 18; purchaseTokenUnits >= 6; purchaseTokenUnits -= 2) {
    for (let offerTokenUnits = 6; offerTokenUnits < purchaseTokenUnits; offerTokenUnits += 2) {
      const pool = await deployPool(
        offerTokenUnits,
        purchaseTokenUnits,
        useLowPriceValue ? (1 / 10 ** purchaseTokenUnits).toFixed(purchaseTokenUnits) : "11.26"
      );
      pools.push(pool);
    }
  }

  return pools;
};

xdescribe("Min contribution should be correctly calculated", () => {
  before(async () => {
    [deployer, user, user1] = await ethers.getSigners();

    console.log("Deploying pools (this may take a while)...");
    console.log("Deploying pools for OFFR decimals >= PRCH decimals...");

    const OFFR_gte_PRCH_price_high = await getPools_OFFR_gte_PRCH();
    const OFFR_gte_PRCH_price_low = await getPools_OFFR_gte_PRCH(true);

    console.log("Deploying pools for OFFR decimals < PRCH decimals...");
    const OFFR_lt_PRCH_price_high = await getPools_OFFR_lt_PRCH();
    const OFFR_lt_PRCH_price_low = await getPools_OFFR_lt_PRCH(true);

    describe("OFFR decimals >= PRCH decimals; higher price", () => {
      OFFR_gte_PRCH_price_high.forEach(({ offerTokenUnits, purchaseTokenUnits, originationPool, priceStringified }) => {
        it(`OFFR(${offerTokenUnits} decimals);PRCH(${purchaseTokenUnits} decimals);Price - ${priceStringified} PRCH per OFFR`, async () => {
          const amountIn = await originationPool.minContributionAmount();
          const mintAmount = await originationPool.getCurrentMintAmount(amountIn);
          const minMintAmount = ethers.utils.parseUnits("1", offerTokenUnits - purchaseTokenUnits);

          console.log(`\n\tPRCH(${purchaseTokenUnits} decimals) & OFFR(${offerTokenUnits} decimals)`);
          console.log("\tMin contribution amount:", ethers.utils.formatUnits(await originationPool.minContributionAmount(), purchaseTokenUnits), "PRCH");
          console.log("\tCurrent price:", ethers.utils.formatUnits(await originationPool.publicStartingPrice(), purchaseTokenUnits), "PRCH");
          console.log("\tMint amount for min contribution:", ethers.utils.formatUnits(mintAmount, offerTokenUnits), "OFFR\n");

          expect(mintAmount.gt(BigNumber.from(0))).to.be.true;
          expect(mintAmount).to.equal(minMintAmount);
        });
      });
    });

    describe("OFFR decimals >= PRCH decimals; low price", async () => {
      OFFR_gte_PRCH_price_low.forEach(({ offerTokenUnits, purchaseTokenUnits, originationPool, priceStringified }) => {
        it(`OFFR(${offerTokenUnits} decimals);PRCH(${purchaseTokenUnits} decimals);Price - ${priceStringified} PRCH per OFFR`, async () => {
          const amountIn = await originationPool.minContributionAmount();
          const mintAmount = await originationPool.getCurrentMintAmount(amountIn);
          const expectedMintAmount = ethers.utils.parseUnits("1", offerTokenUnits);

          console.log(`\n\tPRCH(${purchaseTokenUnits} decimals) & OFFR(${offerTokenUnits} decimals)`);
          console.log("\tMin contribution amount:", ethers.utils.formatUnits(await originationPool.minContributionAmount(), purchaseTokenUnits), "PRCH");
          console.log("\tCurrent price:", ethers.utils.formatUnits(await originationPool.publicStartingPrice(), purchaseTokenUnits), "PRCH");
          console.log("\tMint amount for min contribution:", ethers.utils.formatUnits(mintAmount, offerTokenUnits), "OFFR\n");

          expect(mintAmount.gt(BigNumber.from(0))).to.be.true;
          expect(mintAmount).to.equal(expectedMintAmount);
        });
      });
    });

    describe("OFFR decimals < PRCH decimals; high price", async () => {
      OFFR_lt_PRCH_price_high.forEach(({ offerTokenUnits, purchaseTokenUnits, originationPool, priceStringified }) => {
        it(`OFFR(${offerTokenUnits} decimals);PRCH(${purchaseTokenUnits} decimals);Price - ${priceStringified} PRCH per OFFR`, async () => {
          const amountIn = await originationPool.minContributionAmount();
          const mintAmount = await originationPool.getCurrentMintAmount(amountIn);
          const minMintAmount = ethers.utils.parseUnits("1", 0);

          console.log(`\n\tPRCH(${purchaseTokenUnits} decimals) & OFFR(${offerTokenUnits} decimals)`);
          console.log("\tMin contribution amount:", ethers.utils.formatUnits(await originationPool.minContributionAmount(), purchaseTokenUnits), "PRCH");
          console.log("\tCurrent price:", ethers.utils.formatUnits(await originationPool.publicStartingPrice(), purchaseTokenUnits), "PRCH");
          console.log("\tMint amount for min contribution:", ethers.utils.formatUnits(mintAmount, offerTokenUnits), "OFFR\n");

          expect(mintAmount).to.equal(minMintAmount);
        });
      });
    });

    describe("OFFR decimals < PRCH decimals; lower price", async () => {
      OFFR_lt_PRCH_price_low.forEach(({ offerTokenUnits, purchaseTokenUnits, originationPool, priceStringified }) => {
        it(`OFFR(${offerTokenUnits} decimals);PRCH(${purchaseTokenUnits} decimals);Price - ${priceStringified} PRCH per OFFR`, async () => {
          const amountIn = await originationPool.minContributionAmount();
          const mintAmount = await originationPool.getCurrentMintAmount(amountIn);
          const expectedMintAmount = ethers.utils.parseUnits("1", offerTokenUnits);

          console.log(`\n\tPRCH(${purchaseTokenUnits} decimals) & OFFR(${offerTokenUnits} decimals)`);
          console.log("\tMin contribution amount:", ethers.utils.formatUnits(await originationPool.minContributionAmount(), purchaseTokenUnits), "PRCH");
          console.log("\tCurrent price:", ethers.utils.formatUnits(await originationPool.publicStartingPrice(), purchaseTokenUnits), "PRCH");
          console.log("\tMint amount for min contribution:", ethers.utils.formatUnits(mintAmount, offerTokenUnits), "OFFR\n");

          expect(mintAmount).to.equal(expectedMintAmount);
        });
      });
    });
  });

  // this is needed to trigger the "before" block
  // this is a workaround that allows us to run async dynamicaly generated tests
  it("Executing async & dynamically generated tests", () => {});
});
