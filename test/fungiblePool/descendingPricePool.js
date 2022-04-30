const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist } = require("../../scripts/helpers");


describe("Fungible token sale price descending", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        purchaseToken,
        offerToken,
        originationPoolDescending,
        rootHash,
        deployerProof,
        userProof
      } = await createFixture());
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
  });