const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime } = require("../utils");
const { increaseTime } = require("../../scripts/helpers");

describe("Management functions", async () => {
  beforeEach(async () => {
    ({ accounts, originationCore, originationPool, originationPoolETH, purchaseToken, offerToken, rootHash, deployerProof, userProof } = await createFixture());
    [deployer, user] = accounts;
  });

  it("should not be able to claim purchase tokens before sale end", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("0.5");

    // initiate sale
    await originationPool.initiateSale();

    await originationPool.connect(user).purchase(amountIn);

    await expect(originationPool.connect(deployer).claimPurchaseToken()).to.be.revertedWith("Sale has not ended");
  });

  it("should not be able to claim purchase tokens if the sale reserve amount was not met", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will not receive any offer tokes
    const amountIn = ethers.utils.parseEther("0.5");

    // initiate sale
    await originationPool.initiateSale();
    const totalOfferingAmount = await originationPool.totalOfferingAmount();

    await originationPool.connect(user).purchase(amountIn);
    await advanceTime(86401);
    const offerTokenBalanceBefore = await offerToken.balanceOf(deployer.address);
    await originationPool.connect(deployer).claimPurchaseToken();
    const offerTokenBalanceAfter = await offerToken.balanceOf(deployer.address);

    expect(totalOfferingAmount).to.equal(offerTokenBalanceAfter.sub(offerTokenBalanceBefore));
  });

  it("should be able to claim purchase tokens if the sale has ended succesfully", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const offeringAmount = await originationPool.totalOfferingAmount();

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");

    // initiate sale
    await originationPool.initiateSale();

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);
    const offerBalanceBefore = await offerToken.balanceOf(deployer.address);

    await originationPool.connect(user).purchase(amountIn);
    const amountSold = await originationPool.offerTokenAmountSold();
    await advanceTime(86401);
    await originationPool.connect(deployer).claimPurchaseToken();

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(deployer.address);

    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
    expect(offerBalanceAfter.sub(offerBalanceBefore)).to.equal(offeringAmount.sub(amountSold));
  });

  it("should be able to claim purchase tokens if offer token amount is reached", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    const offeringAmount = await originationPool.totalOfferingAmount();

    // initiate sale
    await originationPool.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(deployer.address);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPool.getPurchaseAmountFromOfferAmount(offeringAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    await originationPool.connect(user).purchase(bigPurchaseAmount);

    const amountSold = await originationPool.offerTokenAmountSold();
    await originationPool.connect(deployer).claimPurchaseToken();

    const offerBalanceAfter = await offerToken.balanceOf(deployer.address);

    expect(offerBalanceAfter.sub(offerBalanceBefore)).to.equal(offeringAmount.sub(amountSold));
  });

  it("should not be able to claim tokens twice", async () => {
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");

    // initiate sale
    await originationPool.initiateSale();

    await originationPool.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await originationPool.connect(deployer).claimPurchaseToken();

    await expect(originationPool.connect(deployer).claimPurchaseToken()).to.be.revertedWith("Tokens already claimed");
  });

  it("should be able to claim ETH purchase tokens if the sale has ended successfully", async () => {
    // disable whitelist
    await originationPoolETH.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");

    // initiate sale
    await originationPoolETH.initiateSale();

    const offerBalanceBefore = await offerToken.balanceOf(deployer.address);

    await originationPoolETH.connect(user).purchase(amountIn, { value: amountIn });
    const amountSold = await originationPoolETH.offerTokenAmountSold();
    await advanceTime(86401);

    const originationCoreFees = await originationPoolETH.originationCoreFees();
    await expect(await originationPoolETH.connect(deployer).claimPurchaseToken()).to.changeEtherBalance(deployer, amountIn.sub(originationCoreFees));
    const offerBalanceAfter = await offerToken.balanceOf(deployer.address);
    const offeringAmount = await originationPoolETH.totalOfferingAmount();
    expect(offerBalanceAfter.sub(offerBalanceBefore)).to.equal(offeringAmount.sub(amountSold));
  });

  it("should be able to set a manager", async () => {
    await expect(originationPool.connect(user).initiateSale()).to.be.revertedWith("Not owner or manager");

    await originationPool.setManager(user.address);

    const offerTokenBalance = await offerToken.balanceOf(deployer.address);
    await offerToken.connect(deployer).transfer(user.address, offerTokenBalance);
    await expect(originationPool.connect(user).initiateSale()).to.not.be.reverted;
  });

  it("should be able to set whitelist multiple times before sale initated as owner or manager", async () => {
    await originationPool.setManager(user.address);

    await expect(originationPool.setWhitelist(ethers.utils.formatBytes32String("0"))).not.to.be.reverted;
    expect(await originationPool.whitelistMerkleRoot()).to.equal(ethers.utils.formatBytes32String("0"));

    await expect(originationPool.setWhitelist(ethers.utils.formatBytes32String("1"))).not.to.be.reverted;
    expect(await originationPool.whitelistMerkleRoot()).to.equal(ethers.utils.formatBytes32String("1"));

    await expect(originationPool.connect(user).setWhitelist(ethers.utils.formatBytes32String("10"))).not.to.be.reverted;
    expect(await originationPool.whitelistMerkleRoot()).to.equal(ethers.utils.formatBytes32String("10"));

    await expect(originationPool.connect(user).setWhitelist(ethers.utils.formatBytes32String("11"))).not.to.be.reverted;
    expect(await originationPool.whitelistMerkleRoot()).to.equal(ethers.utils.formatBytes32String("11"));
  });

  it("should not be able to set whitelist after sale initiated", async () => {
    await originationPool.initiateSale();

    await expect(originationPool.setWhitelist(ethers.utils.formatBytes32String("0"))).to.be.revertedWith("Cannot set whitelist after sale initiated");
  });
});
