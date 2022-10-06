const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist, bn } = require("../../scripts/helpers");

describe("Fungible Pool with ERC-20 Purchase token", async () => {
  beforeEach(async () => {
    ({
      accounts,
      purchaseToken,
      purchaseTokenDecimalsLower,
      offerToken,
      originationPool,
      originationPoolWhitelist,
      originationPoolDecimals,
      originationPoolNoReserveNoVesting,
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
    [deployer, user] = accounts;
  });

  it("should successfully initiate a sale", async () => {
    tx = await originationPool.initiateSale();
    const receipt = await tx.wait();
    const event = await receipt.events.find((e) => e.event === "InitiateSale");
    expect(event).to.not.be.undefined;

    const saleTimestamp = event.args[0];
    expect(saleTimestamp).to.be.gt(0);

    expect(await originationPool.saleInitiated());
  });

  it("should fail to initiate a sale if already initiated", async () => {
    await originationPool.initiateSale();
    await expect(originationPool.initiateSale()).to.be.revertedWith("Sale already initiated");
  });

  it("should successfully make a purchase", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    await originationPool.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await originationPool.connect(user).claimTokens();
    expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(0);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
  });

  it("shouldn't have offer tokens directly distributed before claiming", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await originationPool.connect(user).purchase(amountIn);
    expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(expectedAmountOut);

    const offerBalanceAfter = await offerToken.balanceOf(user.address);
    expect(offerBalanceAfter).to.equal(0);
  });

  it("shouldn't be able to purchase below the min contribution amount", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    // initiate sale
    await originationPool.initiateSale();

    // get min contribution amount
    let minContributionAmount = await originationPool.minContributionAmount();

    let purchaseTokenDecimals = await purchaseToken.decimals();

    // min contribution amount is equal to purchase token decimals / 2
    let expectedMinContributionAmount = bn(10).pow(bn(purchaseTokenDecimals / 2));

    expect(minContributionAmount).to.be.eq(expectedMinContributionAmount);

    await expect(originationPool.connect(user).purchase(minContributionAmount.sub(1))).to.be.revertedWith(
      "Need to contribute at least min contribution amount"
    );
  });

  it("should fail to claim tokens twice", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await originationPool.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await originationPool.connect(user).claimTokens();
    expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(0);

    await expect(originationPool.connect(user).claimTokens()).to.be.revertedWith("No purchase made");
  });

  it("should successfully purchase when purchase decimals are less than offer decimals", async () => {
    // disable whitelist
    await originationPoolDecimals.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseUnits("1", 6);
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    // initiate sale
    await originationPoolDecimals.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseTokenDecimalsLower.balanceOf(user.address);

    await originationPoolDecimals.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await originationPoolDecimals.connect(user).claimTokens();
    expect(await originationPoolDecimals.offerTokenAmountPurchased(user.address)).to.equal(0);

    const purchaseBalanceAfter = await purchaseTokenDecimalsLower.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
  });

  it("should successfully purchase from a whitelisted address", async () => {
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = "200000000000";

    // initiate sale
    await originationPoolWhitelist.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    await originationPoolWhitelist.connect(user).whitelistPurchase(userProof, amountIn, whitelist[user.address]);
    await advanceTime(86401 * 2);
    await originationPoolWhitelist.connect(user).claimTokens();
    expect(await originationPoolWhitelist.offerTokenAmountPurchased(user.address)).to.equal(0);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
  });

  it("shouldn't be able to purchase below the min contribution amount when purchase decimals are less than offer decimals", async () => {
    // disable whitelist
    await originationPoolDecimals.setWhitelist(ethers.utils.formatBytes32String("0"));
    // initiate sale
    await originationPoolDecimals.initiateSale();

    let minContributionAmount = await originationPoolDecimals.minContributionAmount();

    let purchaseTokenDecimals = await purchaseTokenDecimalsLower.decimals();
    let expectedMinContributionAmount = bn(10).pow(purchaseTokenDecimals / 2);

    expect(minContributionAmount).to.be.eq(expectedMinContributionAmount);

    await expect(originationPoolDecimals.connect(user).purchase(minContributionAmount.sub(1))).to.be.revertedWith(
      "Need to contribute at least min contribution amount"
    );
  });

  it("shouldn't be able to purchase above the contribution limit from a whitelisted address", async () => {
    await originationPoolWhitelist.initiateSale();

    let contributionLimit = whitelist[user.address];

    await originationPoolWhitelist.connect(user).whitelistPurchase(userProof, contributionLimit, contributionLimit);
    await expect(originationPoolWhitelist.connect(user).whitelistPurchase(userProof, 1, contributionLimit)).to.be.revertedWith(
      "User has reached their max contribution amount"
    );
  });

  it("should fail to purchase if not whitelisted", async () => {
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");

    // initiate sale
    await originationPoolWhitelist.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    let whitelist = await getMerkleWhitelist();

    await expect(originationPoolWhitelist.connect(user).whitelistPurchase(deployerProof, amountIn, whitelist[user.address])).to.be.revertedWith(
      "Address not whitelisted"
    );
  });

  it("should fail to claim tokens if sale has not ended", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("0.5");

    // initiate sale
    await originationPool.initiateSale();

    await originationPool.connect(user).purchase(amountIn);

    await expect(originationPool.connect(user).claimTokens()).to.be.revertedWith("Sale has not ended");
  });

  it("should return purchase tokens if sale reserve amount was not met", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will not receive any offer tokes
    const amountIn = ethers.utils.parseEther("0.5");
    const expectedAmountOut = ethers.utils.parseUnits("0", 10);

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    await originationPool.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await originationPool.connect(user).claimTokens();
    expect(await originationPool.purchaseTokenContribution(user.address)).to.equal(0);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter);
  });

  it("should refund sender if purchase amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    await originationPool.connect(user).purchase(bigPurchaseAmount);

    let refundAmount = purchaseTokenAmount.div(10);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);

    let purchaseAmountSpent = purchaseBalanceBefore.sub(purchaseBalanceAfter);
    expect(purchaseAmountSpent).to.be.eq(bigPurchaseAmount.sub(refundAmount));
  });

  it("should collect the correct amount of fees if purchase amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = await originationPool.totalOfferingAmount();
    const originationFee = await originationPool.originationFee();

    expect(originationFee).to.equal(ethers.utils.parseUnits("1", 16));
    expect(await originationPool.originationCoreFees()).to.equal(0);

    //initiate sale
    await originationPool.initiateSale();

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    const purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    const bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    // the contribution amount will be the purchase token amount required to buy all offered tokens
    const expectedPuruchaseFee = purchaseTokenAmount.mul(originationFee).div(ethers.utils.parseEther("1"));

    expect(expectedPuruchaseFee).to.be.gt(0);

    await originationPool.connect(user).purchase(bigPurchaseAmount);

    expect(await originationPool.originationCoreFees()).to.equal(expectedPuruchaseFee);
  });

  it("should mark sale as over once refund flow executed while purchasing", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPool.initiateSale();

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    await originationPool.connect(user).purchase(bigPurchaseAmount);

    await expect(originationPool.connect(user).purchase(1)).to.be.revertedWith("Sale over");
  });

  it(`should refund sender if purchase amount exceeds total sale offering for pools with purchase decimals < offer decimals`, async () => {
    // disable whitelist
    await originationPoolDecimals.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPoolDecimals.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseTokenDecimalsLower.balanceOf(user.address);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPoolDecimals.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    await originationPoolDecimals.connect(user).purchase(bigPurchaseAmount);

    let refundAmount = purchaseTokenAmount.div(10);

    const purchaseBalanceAfter = await purchaseTokenDecimalsLower.balanceOf(user.address);

    let purchaseAmountSpent = purchaseBalanceBefore.sub(purchaseBalanceAfter);
    expect(purchaseAmountSpent).to.be.eq(bigPurchaseAmount.sub(refundAmount));
  });

  it("should end sale if offer token amount is exactly reached", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = await originationPool.totalOfferingAmount();

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    const tx = await originationPool.connect(user).purchase(purchaseTokenAmount);
    const callTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

    expect(await originationPool.saleEndTimestamp()).to.eq(callTimestamp);
    await expect(originationPool.connect(user).purchase(1)).to.be.revertedWith("Sale over");
  });

  it("should end sale if offer token amount is exceeded", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    const tx = await originationPool.connect(user).purchase(bigPurchaseAmount);
    const callTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

    expect(await originationPool.saleEndTimestamp()).to.eq(callTimestamp);
    await expect(originationPool.connect(user).purchase(1)).to.be.revertedWith("Sale over");
  });

  it("should be able to claim tokens if offer token amount is reached", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    await originationPool.connect(user).purchase(bigPurchaseAmount);

    // Sale is over now
    await originationPool.connect(user).claimTokens();
    expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(0);

    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(totalOfferingAmount);
  });

  describe("no reserve and no vesting period set", async () => {
    it("should receive the purchased offer tokens right after purchasing", async () => {
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      // initiate sale
      await originationPoolNoReserveNoVesting.initiateSale();
      // past whitelist sale period
      await advanceTime(86401);

      // offerToken = token out
      // purchaseToken = token in
      const offerBalanceBefore = await offerToken.balanceOf(user.address);
      expect(offerBalanceBefore).to.equal(0);

      const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

      await originationPoolNoReserveNoVesting.connect(user).purchase(amountIn);

      const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
      const offerBalanceAfter = await offerToken.balanceOf(user.address);

      expect(await originationPoolNoReserveNoVesting.offerTokenAmountPurchased(user.address)).to.equal(0);
      expect(offerBalanceAfter).to.equal(expectedAmountOut);
      expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
    });

    it("should fail claiming tokens using claimTokens function", async () => {
      // disable whitelist
      await originationPoolNoReserveNoVesting.setWhitelist(ethers.utils.formatBytes32String("0"));

      const amountIn = ethers.utils.parseEther("1");

      // initiate sale
      await originationPoolNoReserveNoVesting.initiateSale();
      // past whitelist sale period
      await advanceTime(86401);

      await originationPoolNoReserveNoVesting.connect(user).purchase(amountIn);
      await advanceTime(86401);

      await expect(originationPoolNoReserveNoVesting.claimTokens()).to.be.revertedWith("Tokens already claimed once purchased");
    });

    it("shouldn't be able to purchase above the contribution limit from a whitelisted address", async () => {
      await originationPoolNoReserveNoVesting.initiateSale();

      let contributionLimit = whitelist[user.address];

      await originationPoolNoReserveNoVesting.connect(user).whitelistPurchase(userProof, contributionLimit, contributionLimit);
      await expect(originationPoolNoReserveNoVesting.connect(user).whitelistPurchase(userProof, 1, contributionLimit)).to.be.revertedWith(
        "User has reached their max contribution amount"
      );
    });
  });
});
