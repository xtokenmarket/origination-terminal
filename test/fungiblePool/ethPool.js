const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist, setBalance } = require("../../scripts/helpers");

describe("Fungible Pool with ETH as purchase coin", async () => {
  beforeEach(async () => {
    ({ accounts, originationCore, originationPoolETH, originationPoolETHWhitelist, purchaseToken, offerToken, rootHash, deployerProof, userProof, whitelist } =
      await createFixture());
    [deployer, user] = accounts;
  });

  it("should successfully initiate a sale", async () => {
    tx = await originationPoolETH.initiateSale();
    const receipt = await tx.wait();
    const event = await receipt.events.find((e) => e.event === "InitiateSale");
    expect(event).to.not.be.undefined;

    const saleTimestamp = event.args[0];
    expect(saleTimestamp).to.be.gt(0);

    expect(await originationPoolETH.saleInitiated());
  });

  it("should fail to initiate a sale if not owner or manager", async () => {
    await expect(originationPoolETH.connect(user).initiateSale()).to.be.revertedWith("Not owner or manager");
  });

  it("should successfully make a purchase", async () => {
    // disable whitelist
    await originationPoolETH.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    // initiate sale
    await originationPoolETH.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await expect(await originationPoolETH.connect(user).purchase(amountIn, { value: amountIn })).to.changeEtherBalance(user, amountIn.mul(-1));
    await advanceTime(86401);
    await originationPoolETH.connect(user).claimTokens();
    expect(await originationPoolETH.offerTokenAmountPurchased(user.address)).to.equal(0);

    const offerBalanceAfter = await offerToken.balanceOf(user.address);
    expect(offerBalanceAfter).to.equal(expectedAmountOut);
  });

  it("should successfully purchase from a whitelisted address", async () => {
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = "200000000000";

    // initiate sale
    await originationPoolETHWhitelist.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await expect(
      await originationPoolETHWhitelist.connect(user).whitelistPurchase(userProof, amountIn, whitelist[user.address], { value: amountIn })
    ).to.changeEtherBalance(user, amountIn.mul(-1));
    await advanceTime(86401 * 2);
    await originationPoolETHWhitelist.connect(user).claimTokens();
    expect(await originationPoolETHWhitelist.offerTokenAmountPurchased(user.address)).to.equal(0);

    const offerBalanceAfter = await offerToken.balanceOf(user.address);
    expect(offerBalanceAfter).to.equal(expectedAmountOut);
  });

  it("shouldn't be able to purchase above the contribution limit from a whitelisted address", async () => {
    await originationPoolETHWhitelist.initiateSale();

    let contributionLimit = whitelist[user.address];

    await originationPoolETHWhitelist.connect(user).whitelistPurchase(userProof, contributionLimit, contributionLimit, { value: contributionLimit });
    await expect(originationPoolETHWhitelist.connect(user).whitelistPurchase(userProof, contributionLimit, contributionLimit, { value: 1 })).to.be.revertedWith(
      "User has reached their max contribution amount"
    );
  });

  it("should fail to purchase if not on the whitelist", async () => {
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    // initiate sale
    await originationPoolETHWhitelist.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await expect(
      originationPoolETHWhitelist.connect(user).whitelistPurchase(deployerProof, amountIn, whitelist[user.address], { value: amountIn })
    ).to.be.revertedWith("Address not whitelisted");
  });

  it("should return ETH purchase tokens if sale did not reach reserve amount", async () => {
    // disable whitelist
    await originationPoolETH.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will not receive any offer tokes
    const amountIn = ethers.utils.parseEther("0.5");
    const expectedAmountOut = ethers.utils.parseUnits("0", 10);

    // initiate sale
    await originationPoolETH.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await originationPoolETH.connect(user).purchase(amountIn, { value: amountIn });
    await advanceTime(86401);
    await expect(await originationPoolETH.connect(user).claimTokens()).to.changeEtherBalance(user, amountIn);
    expect(await originationPoolETH.purchaseTokenContribution(user.address)).to.equal(0);

    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
  });

  it("should refund sender if purchase amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPoolETH.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPoolETH.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPoolETH.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    let refundAmount = purchaseTokenAmount.div(10);
    let expectedEthSent = "-" + bigPurchaseAmount.sub(refundAmount).toString();
    await setBalance(user.address, bigPurchaseAmount.add(bigPurchaseAmount.div(10)));
    await expect(await originationPoolETH.connect(user).purchase(bigPurchaseAmount, { value: bigPurchaseAmount })).to.changeEtherBalance(user, expectedEthSent);
  });

  it("should collect the correct amount of ETH fees if purchase amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPoolETH.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = await originationPoolETH.totalOfferingAmount();
    const originationFee = await originationPoolETH.originationFee();

    expect(originationFee).to.equal(ethers.utils.parseUnits("1", 16));
    expect(await originationPoolETH.originationCoreFees()).to.equal(0);

    //initiate sale
    await originationPoolETH.initiateSale();

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPoolETH.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    const bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    // the contribution amount will be the purchase token amount required to buy all offered tokens
    const expectedPuruchaseFee = purchaseTokenAmount.mul(originationFee).div(ethers.utils.parseEther("1"));

    expect(expectedPuruchaseFee).to.be.gt(0);

    await setBalance(user.address, bigPurchaseAmount.add(bigPurchaseAmount.div(10)));
    await originationPoolETH.connect(user).purchase(bigPurchaseAmount, { value: bigPurchaseAmount });

    expect(await originationPoolETH.originationCoreFees()).to.equal(expectedPuruchaseFee);
  });

  it("should be able to claim offer tokens if total offering amount is reached", async () => {
    // disable whitelist
    await originationPoolETH.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPoolETH.initiateSale();

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    let purchaseTokenAmount = await originationPoolETH.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // purchase exceeds sale ceiling by 10%
    let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    await setBalance(user.address, bigPurchaseAmount.add(bigPurchaseAmount.div(10)));
    await originationPoolETH.connect(user).purchase(bigPurchaseAmount, { value: bigPurchaseAmount });
    // Sale is over now
    await originationPoolETH.connect(user).claimTokens();
    expect(await originationPoolETH.offerTokenAmountPurchased(user.address)).to.equal(0);

    const offerBalanceAfter = await offerToken.balanceOf(user.address);
    const expectedAmountOut = totalOfferingAmount;
    expect(offerBalanceAfter).to.equal(expectedAmountOut);
  });
});
