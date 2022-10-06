const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime, getEvmSnapshot, revertEvm } = require("../utils");
const { increaseTime, setBalance } = require("../../scripts/helpers");

describe("Fungible token sale price descending", async () => {
  beforeEach(async () => {
    ({ accounts, originationCore, purchaseToken, offerToken, originationPoolDescending, originationPoolETHDescending, rootHash, deployerProof, userProof } = await createFixture());
    [deployer, user] = accounts;
  });

  it("should successfully purchase tokens", async () => {
    // disable whitelist
    await originationPoolDescending.setWhitelist(ethers.utils.formatBytes32String("0"));

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const publicStartingPrice = await originationPoolDescending.publicStartingPrice();
    const publicEndingPrice = await originationPoolDescending.publicEndingPrice();
    const saleDelta = publicStartingPrice.sub(publicEndingPrice).div(2);
    const expectedTokenPrice = publicStartingPrice.sub(saleDelta); // half way through sale period
    const expectedAmountOut = amountIn.mul(1e10).div(expectedTokenPrice);

    await originationPoolDescending.initiateSale();

    await advanceTime(43200); // 12 hours (half way through sale)

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    await originationPoolDescending.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await originationPoolDescending.connect(user).claimTokens();
    expect(await originationPoolDescending.offerTokenAmountPurchased(user.address)).to.equal(0);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
  });

  it("should refund sender if the purchase token amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPoolDescending.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPoolDescending.initiateSale();

    const snapshotID = await getEvmSnapshot();
    await increaseTime(1);

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    // Get the purchase token amount required to buy all offered tokens
    const purchaseTokenAmount = await originationPoolDescending.getPurchaseAmountFromOfferAmount(totalOfferingAmount);
    // purchase exceeds sale ceiling by 10%
    const bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    // calculate the expected refund amount
    const expectedOfferTokens = await originationPoolDescending.getCurrentMintAmount(bigPurchaseAmount);
    const expectedRefundAmount = await originationPoolDescending.getPurchaseAmountFromOfferAmount(expectedOfferTokens.sub(totalOfferingAmount));

    await revertEvm(snapshotID);
    await originationPoolDescending.connect(user).purchase(bigPurchaseAmount);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const purchaseAmountSpent = purchaseBalanceBefore.sub(purchaseBalanceAfter);

    expect(purchaseAmountSpent).to.be.eq(bigPurchaseAmount.sub(expectedRefundAmount));
  });

  it("should refund sender if the ETH purchase amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPoolETHDescending.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // set user balance
    await setBalance(user.address, ethers.utils.parseEther("2000000"));

    // initiate sale
    await originationPoolETHDescending.initiateSale();
    const snapshotID = await getEvmSnapshot();
    await increaseTime(1);

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseTokenAmount = await originationPoolETHDescending.getPurchaseAmountFromOfferAmount(totalOfferingAmount);
    // purchase exceeds sale ceiling by 10%
    const bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    // set user balance
    await setBalance(user.address, bigPurchaseAmount.add(bigPurchaseAmount.div(10)));
    // calculate the expected refund amount
    const expectedOfferTokens = await originationPoolETHDescending.getCurrentMintAmount(bigPurchaseAmount);
    const expectedRefundAmount = await originationPoolETHDescending.getPurchaseAmountFromOfferAmount(expectedOfferTokens.sub(totalOfferingAmount));

    await revertEvm(snapshotID);

    await expect(await originationPoolETHDescending.connect(user).purchase(bigPurchaseAmount, { value: bigPurchaseAmount })).to.changeEtherBalance(
      user,
      "-" + bigPurchaseAmount.sub(expectedRefundAmount)
    );
  });
});
