const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime, getEvmSnapshot, revertEvm } = require("../utils");
const { increaseTime, setBalance } = require("../../scripts/helpers");

describe("Fungible token sale price ascending", async () => {
  beforeEach(async () => {
    ({ accounts, originationCore, purchaseToken, offerToken, originationPoolAscending, originationPoolETHAscending, rootHash, deployerProof, userProof } =
      await createFixture());
    [deployer, user] = accounts;
  });

  it("should successfully purchase tokens", async () => {
    // disable whitelist
    await originationPoolAscending.setWhitelist(ethers.utils.formatBytes32String("0"));

    // offerToken = token out
    // purchaseToken = token in
    expect(await offerToken.balanceOf(user.address)).to.equal(0);

    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    const publicStartingPrice = await originationPoolAscending.publicStartingPrice();
    const publicEndingPrice = await originationPoolAscending.publicEndingPrice();
    const saleDelta = publicEndingPrice.sub(publicStartingPrice).div(2);
    const expectedTokenPrice = publicStartingPrice.add(saleDelta); // half way through sale period
    const expectedAmountOut = amountIn.mul(1e10).div(expectedTokenPrice);
    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    await originationPoolAscending.initiateSale();
    await advanceTime(43200); // 12 hours (half way through sale)
    await originationPoolAscending.connect(user).purchase(amountIn);

    await advanceTime(86401);
    await originationPoolAscending.connect(user).claimTokens();
    expect(await originationPoolAscending.offerTokenAmountPurchased(user.address)).to.equal(0);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const offerBalanceAfter = await offerToken.balanceOf(user.address);

    expect(offerBalanceAfter).to.equal(expectedAmountOut);
    expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
  });

  it("should refund sender if the purchase token amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPoolAscending.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // initiate sale
    await originationPoolAscending.initiateSale();

    const snapshotID = await getEvmSnapshot();
    await increaseTime(1);

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

    // Get the purchase token amount required to buy all offered tokens
    const purchaseTokenAmount = await originationPoolAscending.getPurchaseAmountFromOfferAmount(totalOfferingAmount);
    // purchase exceeds sale ceiling by 10%
    const bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    // calculate the expected refund amount
    const expectedOfferTokens = await originationPoolAscending.getCurrentMintAmount(bigPurchaseAmount);
    const expectedRefundAmount = await originationPoolAscending.getPurchaseAmountFromOfferAmount(expectedOfferTokens.sub(totalOfferingAmount));

    await revertEvm(snapshotID);
    await originationPoolAscending.connect(user).purchase(bigPurchaseAmount);

    const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
    const purchaseAmountSpent = purchaseBalanceBefore.sub(purchaseBalanceAfter);

    expect(purchaseAmountSpent).to.be.eq(bigPurchaseAmount.sub(expectedRefundAmount));
  });

  it("should refund sender if the ETH purchase amount exceeds total sale offering", async () => {
    // disable whitelist
    await originationPoolETHAscending.setWhitelist(ethers.utils.formatBytes32String("0"));
    const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

    // set user balance
    await setBalance(user.address, ethers.utils.parseEther("2000000"));

    // initiate sale
    await originationPoolETHAscending.initiateSale();
    const snapshotID = await getEvmSnapshot();
    await increaseTime(1);

    // offerToken = token out
    // purchaseToken = token in
    const offerBalanceBefore = await offerToken.balanceOf(user.address);
    expect(offerBalanceBefore).to.equal(0);

    const purchaseTokenAmount = await originationPoolETHAscending.getPurchaseAmountFromOfferAmount(totalOfferingAmount);
    // purchase exceeds sale ceiling by 10%
    const bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
    // set user balance
    await setBalance(user.address, bigPurchaseAmount.add(bigPurchaseAmount.div(10)));
    // calculate the expected refund amount
    const expectedOfferTokens = await originationPoolETHAscending.getCurrentMintAmount(bigPurchaseAmount);
    const expectedRefundAmount = await originationPoolETHAscending.getPurchaseAmountFromOfferAmount(expectedOfferTokens.sub(totalOfferingAmount));

    await revertEvm(snapshotID);

    await expect(await originationPoolETHAscending.connect(user).purchase(bigPurchaseAmount, { value: bigPurchaseAmount })).to.changeEtherBalance(
      user,
      "-" + bigPurchaseAmount.sub(expectedRefundAmount)
    );
  });
});
