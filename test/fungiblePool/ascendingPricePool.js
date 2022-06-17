const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime } = require("../utils");

describe("Fungible token sale price ascending", async () => {
  beforeEach(async () => {
    ({ accounts, originationCore, purchaseToken, offerToken, originationPoolAscending, rootHash, deployerProof, userProof } = await createFixture());
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
});
