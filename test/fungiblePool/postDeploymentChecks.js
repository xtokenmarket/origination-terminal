const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceTime } = require("../utils");
const createFixture = require("./fungibleFixture");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Fungible Pool state check right after deployment", async () => {
  beforeEach(async () => {
    ({
      accounts,
      purchaseToken,
      purchaseTokenDecimalsLower,
      offerToken,
      originationPool,
      originationPoolAscending,
      originationPoolDescending,
      originationPoolWhitelist,
      originationPoolDecimals,
      rootHash,
      deployerProof,
      userProof,
      whitelist,
      publicStartingPricePerPurchaseToken,
      publicEndingPricePerPurchaseToken,
      whitelistStartingPrice,
      poolCreationParams,
      originationFee,
    } = await createFixture());
    [deployer, user1, user2] = accounts;
  });

  // state variables values of the contract
  it("should have expected state right after deployment of originationPool contract", async () => {
    const params = poolCreationParams[originationPool.address];

    expect(await originationPool.offerToken()).to.eq(offerToken.address);
    expect(await originationPool.purchaseToken()).to.eq(purchaseToken.address);
    expect(await originationPool.publicStartingPrice()).to.eq(params.publicStartingPrice);
    expect(await originationPool.publicEndingPrice()).to.eq(params.publicEndingPrice);
    expect(await originationPool.whitelistStartingPrice()).to.eq(params.whitelistStartingPrice);
    expect(await originationPool.whitelistEndingPrice()).to.eq(params.whitelistEndingPrice);
    expect(await originationPool.saleDuration()).to.eq(params.whitelistSaleDuration + params.publicSaleDuration);
    expect(await originationPool.totalOfferingAmount()).to.eq(params.totalOfferingAmount);
    expect(await originationPool.reserveAmount()).to.eq(params.reserveAmount);
    expect(await originationPool.vestingPeriod()).to.eq(params.vestingPeriod);
    expect(await originationPool.cliffPeriod()).to.eq(params.cliffPeriod);
    expect(await originationPool.whitelistMerkleRoot()).to.eq(rootHash);
    expect(await originationPool.originationFee()).to.eq(originationFee);
    if (params.vestingPeriod === 0) {
      expect(await originationPool.vestingEntryNFT()).to.eq(NULL_ADDRESS);
    }
    expect(await originationPool.manager()).to.eq(NULL_ADDRESS);
    expect(await originationPool.saleInitiated()).to.be.false;
    expect(await originationPool.saleInitiatedTimestamp()).to.eq(0);
    expect(await originationPool.saleEndTimestamp()).to.eq(0);

    expect(await originationPool.vestableTokenAmount()).to.eq(0);
    expect(await originationPool.vestingID()).to.eq(0);

    expect(await originationPool.offerTokenAmountSold()).to.eq(0);
    expect(await originationPool.purchaseTokensAcquired()).to.eq(0);
    expect(await originationPool.originationCoreFees()).to.eq(0);
    expect(await originationPool.sponsorTokensClaimed()).to.eq(false);

    expect(await originationPool.owner()).to.eq(deployer.address);

    expect(await originationPool.isWhitelistMintPeriod()).to.be.false;
    expect(await originationPool.isPublicMintPeriod()).to.be.false;
  });

  // before sale initialization check
  it("should not allow investors to whitelistPurchase tokens", async () => {
    await expect(originationPool.connect(user1).whitelistPurchase(userProof, ethers.utils.parseEther("1"), whitelist[user.address])).to.be.revertedWith(
      "Not whitelist period"
    );
  });

  it("should not allow investors to purchase tokens if the sale is not initiated", async () => {
    await expect(originationPool.connect(user1).purchase(ethers.utils.parseEther("1"))).to.be.revertedWith("Not public mint period");
  });

  it("should not allow investors to claim tokens if sale is not initiated", async () => {
    await expect(originationPool.connect(user1).claimTokens()).to.be.revertedWith("No contribution made");
  });

  it("should not allow investors to claim vested  tokens if sale is not initiated", async () => {
    await expect(originationPool.connect(user1).claimVested([1])).to.be.revertedWith("Sale reserve amount not met");
  });

  // access rights checks
  it("should fail to initiate a sale if not owner or manager", async () => {
    await expect(originationPool.connect(user1).initiateSale()).to.be.revertedWith("Not owner or manager");
  });

  it("should not allow non-owners to set the pool manager", async () => {
    await expect(originationPool.connect(user1).setManager(user2.address)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("should not be able to check mintable tokens amount if before sale started or after sale is over", async () => {
    await expect(originationPool.getCurrentMintAmount(ethers.utils.parseEther("1"))).to.be.revertedWith("Sale not started or over");
    // initiate sale
    await originationPool.initiateSale();

    // call during sale
    await advanceTime(43200);
    await expect(originationPool.getCurrentMintAmount(ethers.utils.parseEther("1"))).to.not.be.reverted;

    await advanceTime(86401);
    // after sale is over
    await expect(originationPool.getCurrentMintAmount(ethers.utils.parseEther("1"))).to.be.revertedWith("Sale not started or over");
  });

  describe(".getCurrentMintAmount() output", async () => {
    it("standard price pool", async () => {
      await originationPool.initiateSale();
      advanceTime(1);

      const amountIn = ethers.utils.parseEther("1");
      const tokenPrice = await originationPool.publicStartingPrice();
      const expectedAmountOut = amountIn.mul(1e10).div(tokenPrice);
      const currentMintAmount = await originationPool.getCurrentMintAmount(amountIn);

      expect(expectedAmountOut).to.equal(currentMintAmount);
    });

    it("ascending price pool", async () => {
      await originationPoolAscending.initiateSale();
      const amountIn = ethers.utils.parseEther("1");
      const publicStartingPrice = await originationPoolAscending.publicStartingPrice();
      const publicEndingPrice = await originationPoolAscending.publicEndingPrice();
      const saleDelta = publicEndingPrice.sub(publicStartingPrice).div(2);
      const expectedTokenPrice = publicStartingPrice.add(saleDelta); // half way through sale period
      const expectedAmountOut = amountIn.mul(1e10).div(expectedTokenPrice);

      await advanceTime(43201); // 12 hours (half way through sale)
      const currentMintAmount = await originationPoolAscending.getCurrentMintAmount(amountIn);

      expect(expectedAmountOut).to.equal(currentMintAmount);
    });

    it("descending price pool", async () => {
      await originationPoolDescending.initiateSale();
      const amountIn = ethers.utils.parseEther("1");
      const publicStartingPrice = await originationPoolDescending.publicStartingPrice();
      const publicEndingPrice = await originationPoolDescending.publicEndingPrice();
      const saleDelta = publicStartingPrice.sub(publicEndingPrice).div(2);
      const expectedTokenPrice = publicStartingPrice.sub(saleDelta); // half way through sale period
      const expectedAmountOut = amountIn.mul(1e10).div(expectedTokenPrice);

      await advanceTime(43201); // 12 hours (half way through sale)
      const currentMintAmount = await originationPoolDescending.getCurrentMintAmount(amountIn);

      expect(expectedAmountOut).to.equal(currentMintAmount);
    });
  });

  describe(".getPurchaseAmountFromOfferAmount() output", async () => {
    it("standard price pool", async () => {
      await originationPool.initiateSale();
      advanceTime(1);

      const expectedPurchaseAmount = ethers.utils.parseEther("1");
      const tokenPrice = await originationPool.publicStartingPrice();
      const offerTokenAmount = expectedPurchaseAmount.mul(1e10).div(tokenPrice);
      const purchaseAmount = await originationPool.getPurchaseAmountFromOfferAmount(offerTokenAmount);

      expect(expectedPurchaseAmount).to.equal(purchaseAmount);
    });

    it("ascending price pool", async () => {
      await originationPoolAscending.initiateSale();
      const expectedPurchaseAmount = ethers.utils.parseEther("1");
      const publicStartingPrice = await originationPoolAscending.publicStartingPrice();
      const publicEndingPrice = await originationPoolAscending.publicEndingPrice();
      const saleDelta = publicEndingPrice.sub(publicStartingPrice).div(2);
      const expectedTokenPrice = publicStartingPrice.add(saleDelta); // half way through sale period
      const offerAmount = expectedPurchaseAmount.mul(1e10).div(expectedTokenPrice);

      await advanceTime(43201); // 12 hours (half way through sale)
      const purchaseAmount = await originationPoolAscending.getPurchaseAmountFromOfferAmount(offerAmount);

      expect(expectedPurchaseAmount).to.equal(purchaseAmount);
    });

    it("descending price pool", async () => {
      await originationPoolDescending.initiateSale();
      const expectedPurchaseAmount = ethers.utils.parseEther("1");
      const publicStartingPrice = await originationPoolDescending.publicStartingPrice();
      const publicEndingPrice = await originationPoolDescending.publicEndingPrice();
      const saleDelta = publicStartingPrice.sub(publicEndingPrice).div(2);
      const expectedTokenPrice = publicStartingPrice.sub(saleDelta); // half way through sale period
      const offerAmount = expectedPurchaseAmount.mul(1e10).div(expectedTokenPrice);

      await advanceTime(43201); // 12 hours (half way through sale)
      const purchaseAmount = await originationPoolDescending.getPurchaseAmountFromOfferAmount(offerAmount);

      expect(expectedPurchaseAmount).to.equal(purchaseAmount);
    });
  });

  describe(".getOfferTokenPrice() output", async () => {
    it("standard price pool", async () => {
      await originationPool.initiateSale();
      advanceTime(1);

      const expectedOfferTokenPrice = await originationPool.publicStartingPrice();
      expect(await originationPool.getOfferTokenPrice()).to.equal(expectedOfferTokenPrice);

      await advanceTime(43201); // 12 hours (half way through sale)
      // offer token price shouldn't change
      expect(await originationPool.getOfferTokenPrice()).to.equal(expectedOfferTokenPrice);
    });

    it("ascending price pool", async () => {
      await originationPoolAscending.initiateSale();
      const publicStartingPrice = await originationPoolAscending.publicStartingPrice();
      const publicEndingPrice = await originationPoolAscending.publicEndingPrice();
      const saleDelta = publicEndingPrice.sub(publicStartingPrice).div(2);
      const expectedOfferTokenPrice = publicStartingPrice.add(saleDelta);

      await advanceTime(43201); // 12 hours (half way through sale)
      expect(await originationPoolAscending.getOfferTokenPrice()).to.equal(expectedOfferTokenPrice);
    });

    it("descending price pool", async () => {
      await originationPoolDescending.initiateSale();
      const publicStartingPrice = await originationPoolDescending.publicStartingPrice();
      const publicEndingPrice = await originationPoolDescending.publicEndingPrice();
      const saleDelta = publicStartingPrice.sub(publicEndingPrice).div(2);
      const expectedOfferTokenPrice = publicStartingPrice.sub(saleDelta); // half way through sale period

      await advanceTime(43201); // 12 hours (half way through sale)
      expect(await originationPoolDescending.getOfferTokenPrice()).to.equal(expectedOfferTokenPrice);
    });
  });
});
