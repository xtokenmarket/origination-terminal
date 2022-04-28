const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fixture");
const { advanceTime } = require("./utils");
const { BigNumber } = require("ethers");
const { increaseTime, setBalance } = require("../scripts/helpers");

describe("FungibleOriginationPool", async () => {
  let deployer, user, user1;
  let originationCore;
  let purchaseToken;
  let purchaseTokenDecimalsLower;
  let offerToken;

  let originationPool;
  let originationPoolETH;
  let originationPoolWhitelist;
  let originationPoolETHWhitelist;
  let originationPoolDecimals;
  let originationPoolAscending;
  let originationPoolVesting;
  let originationPoolVestingDecimals;

  let rootHash;
  let deployerProof;
  let userProof;
  let purchaseCap;

  describe("Purchase token not ETH", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        purchaseToken,
        purchaseTokenDecimalsLower,
        offerToken,
        originationPool,
        originationPoolETH,
        originationPoolWhitelist,
        originationPoolETHWhitelist,
        originationPoolDecimals,
        rootHash,
        deployerProof,
        userProof,
        purchaseCap,
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

    it("should fail to initiate a sale if not owner or manager", async () => {
      await expect(originationPool.connect(user).initiateSale()).to.be.revertedWith("Not owner or manager");
    });

    it("should successfully make a purchase", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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

    it("should fail to claim tokens twice", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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

      await expect(originationPool.connect(user).claimTokens()).to.be.revertedWith("No purchase made");
    });

    it("should successfully purchase when purchase decimals are less than offer decimals", async () => {
      // disable whitelist
      await originationPoolDecimals.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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

      await originationPoolWhitelist.connect(user).whitelistPurchase(userProof, amountIn);
      await advanceTime(86401 * 2);
      await originationPoolWhitelist.connect(user).claimTokens();
      expect(await originationPoolWhitelist.offerTokenAmountPurchased(user.address)).to.equal(0);

      const purchaseBalanceAfter = await purchaseToken.balanceOf(user.address);
      const offerBalanceAfter = await offerToken.balanceOf(user.address);

      expect(offerBalanceAfter).to.equal(expectedAmountOut);
      expect(purchaseBalanceBefore).to.equal(purchaseBalanceAfter.add(amountIn));
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

      await expect(originationPoolWhitelist.connect(user).whitelistPurchase(deployerProof, amountIn)).to.be.revertedWith(
        "Address not whitelisted"
      );
    });

    it("should fail to claim tokens if sale has not ended", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("0.5");

      // initiate sale
      await originationPool.initiateSale();

      await originationPool.connect(user).purchase(amountIn);

      await expect(originationPool.connect(user).claimTokens()).to.be.revertedWith("Sale has not ended");
    });

    it("should return purchase tokens if sale reserve amount was not met", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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

    it(`should refund sender if purchase amount exceeds total sale offering 
              for pools with purchase decimals < offer decimals`, async () => {
      // disable whitelist
      await originationPoolDecimals.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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

    it("should end sale if offer token amount is reached", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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
      
      await expect(originationPool.connect(user).purchase(1)).to.be.revertedWith('Sale not started or over');
    });

    it("should be able to claim tokens if offer token amount is reached", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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
  });

  describe("Admin function", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        originationPool,
        originationPoolETH,
        purchaseToken,
        offerToken,
        rootHash,
        deployerProof,
        userProof,
      } = await createFixture());
      [deployer, user] = accounts;
    });

    it("should not be able to claim purchase tokens before sale end", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("0.5");

      // initiate sale
      await originationPool.initiateSale();

      await originationPool.connect(user).purchase(amountIn);

      await expect(originationPool.connect(deployer).claimPurchaseToken()).to.be.revertedWith("Sale has not ended");
    });

    it("should not be able to claim purchase tokens if the sale reserve amount was not met", async () => {
      // disable whitelist
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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
      await originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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
      await originationPoolETH.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");

      // initiate sale
      await originationPoolETH.initiateSale();

      const offerBalanceBefore = await offerToken.balanceOf(deployer.address);

      await originationPoolETH.connect(user).purchase(amountIn, { value: amountIn });
      const amountSold = await originationPoolETH.offerTokenAmountSold();
      await advanceTime(86401);

      const originationCoreFees = await originationPoolETH.originationCoreFees();
      await expect(await originationPoolETH.connect(deployer).claimPurchaseToken()).to.changeEtherBalance(
        deployer,
        amountIn.sub(originationCoreFees)
      );
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

    it("should not be able to set whitelist after sale initiated", async () => {
      await originationPool.initiateSale();

      await expect(originationPool.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0])).to.be.revertedWith(
        "Cannot set whitelist after sale initiated"
      );
    });
  });

  describe("Purchase token ETH", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        originationPoolETH,
        purchaseToken,
        offerToken,
        rootHash,
        deployerProof,
        userProof,
      } = await createFixture());
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
      await originationPoolETH.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      // initiate sale
      await originationPoolETH.initiateSale();

      // offerToken = token out
      // purchaseToken = token in
      const offerBalanceBefore = await offerToken.balanceOf(user.address);
      expect(offerBalanceBefore).to.equal(0);

      await expect(
        await originationPoolETH.connect(user).purchase(amountIn, { value: amountIn })
      ).to.changeEtherBalance(user, amountIn.mul(-1));
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
        await originationPoolETHWhitelist.connect(user).whitelistPurchase(userProof, amountIn, { value: amountIn })
      ).to.changeEtherBalance(user, amountIn.mul(-1));
      await advanceTime(86401 * 2);
      await originationPoolETHWhitelist.connect(user).claimTokens();
      expect(await originationPoolETHWhitelist.offerTokenAmountPurchased(user.address)).to.equal(0);

      const offerBalanceAfter = await offerToken.balanceOf(user.address);
      expect(offerBalanceAfter).to.equal(expectedAmountOut);
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
        originationPoolETHWhitelist.connect(user).whitelistPurchase(deployerProof, amountIn, { value: amountIn })
      ).to.be.revertedWith("Address not whitelisted");
    });

    it("should return ETH purchase tokens if sale did not reach reserve amount", async () => {
      // disable whitelist
      await originationPoolETH.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

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
      await originationPoolETH.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
      const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

      // initiate sale
      await originationPoolETH.initiateSale();

      // offerToken = token out
      // purchaseToken = token in
      const offerBalanceBefore = await offerToken.balanceOf(user.address);
      expect(offerBalanceBefore).to.equal(0);

      const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

      await increaseTime(1);
      // Get the purchase token amount required to buy all offered tokens
      let purchaseTokenAmount = await originationPoolETH.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

      // purchase exceeds sale ceiling by 10%
      let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
      let refundAmount = purchaseTokenAmount.div(10);
      let expectedEthSent = "-" + bigPurchaseAmount.sub(refundAmount).toString();
      await setBalance(user.address, bigPurchaseAmount.add(bigPurchaseAmount.div(10)));
      await expect(await originationPoolETH.connect(user).purchase(bigPurchaseAmount, { value: bigPurchaseAmount })).
        to.changeEtherBalance(user, expectedEthSent)
    });

    it("should be able to claim offer tokens if total offering amount is reached", async () => {
      // disable whitelist
      await originationPoolETH.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
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

  describe("Token sale price ascending", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        purchaseToken,
        offerToken,
        originationPoolAscending,
        rootHash,
        deployerProof,
        userProof,
        purchaseCap,
      } = await createFixture());
      [deployer, user] = accounts;
    });

    it("should successfully purchase tokens", async () => {
      // disable whitelist
      await originationPoolAscending.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const startingPrice = await originationPoolAscending.startingPrice();
      const endingPrice = await originationPoolAscending.endingPrice();
      const saleDelta = endingPrice.sub(startingPrice).div(2);
      const expectedTokenPrice = startingPrice.add(saleDelta); // half way through sale period
      const expectedAmountOut = amountIn.mul(1e10).div(expectedTokenPrice);

      await originationPoolAscending.initiateSale();

      await advanceTime(43200); // 12 hours (half way through sale)

      // offerToken = token out
      // purchaseToken = token in
      const offerBalanceBefore = await offerToken.balanceOf(user.address);
      expect(offerBalanceBefore).to.equal(0);

      const purchaseBalanceBefore = await purchaseToken.balanceOf(user.address);

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

  describe("Token sale price descending", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        purchaseToken,
        offerToken,
        originationPoolDescending,
        rootHash,
        deployerProof,
        userProof,
        purchaseCap,
      } = await createFixture());
      [deployer, user] = accounts;
    });

    it("should successfully purchase tokens", async () => {
      // disable whitelist
      await originationPoolDescending.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);

      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const startingPrice = await originationPoolDescending.startingPrice();
      const endingPrice = await originationPoolDescending.endingPrice();
      const saleDelta = startingPrice.sub(endingPrice).div(2);
      const expectedTokenPrice = startingPrice.sub(saleDelta); // half way through sale period
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

  describe("Token sale vesting", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        purchaseToken,
        offerToken,
        originationPoolVesting,
        originationPoolVestingDecimals,
        rootHash,
        deployerProof,
        userProof,
        purchaseCap,
      } = await createFixture());
      [deployer, user, user1] = accounts;
    });

    it("should fail to claim vested tokens before sale has ended", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await expect(originationPoolVesting.claimVested([userVestingId])).to.be.revertedWith("Sale has not ended");
    });

    it("should fail to claim vested tokens before cliff period", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);
      await advanceTime(86401);

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await expect(originationPoolVesting.connect(user).claimVested([userVestingId])).to.be.revertedWith(
        "Not past cliff period"
      );
    });

    it("should fail to claim vested tokens if they do not belong to user", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);
      await advanceTime(86401);
      await advanceTime(216000); // 2.5 days

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await expect(originationPoolVesting.claimVested([userVestingId])).to.be.revertedWith("User not owner of vest id");
    });

    it("should fail to claim tokens using claimTokens", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);
      await advanceTime(86401); // end of sale
      await advanceTime(216000); // 2.5 days
      const ratio = 2.5 / 3; // 2.5 days out of 3

      // claim tokens can only be used with non-vesting pools
      await expect(originationPoolVesting.connect(user).claimTokens()).
        to.be.revertedWith("Tokens must be claimed using claimVested")
    });

    it("should return purchase tokens if sale did not meet reserve amount", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("0.5");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);
      await advanceTime(86401);

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      const purchaseTokensBefore = await purchaseToken.balanceOf(user.address);
      await originationPoolVesting.connect(user).claimTokens();
      expect(await originationPoolVesting.purchaseTokenContribution(user.address)).to.equal(0);
      const purchaseTokensAfter = await purchaseToken.balanceOf(user.address);

      expect(purchaseTokensAfter).to.equal(purchaseTokensBefore.add(amountIn));
    });

    it("should allow claiming a proportional amount after the cliff", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);
      await advanceTime(86401); // end of sale
      await advanceTime(216000); // 2.5 days
      const ratio = 2.5 / 3; // 2.5 days out of 3

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      const offerTokensBefore = await offerToken.balanceOf(user.address);
      await originationPoolVesting.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut * ratio)), 1e6);
    });

    it("should allow claiming the full amount after the cliff", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseEther("1");
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);
      await advanceTime(86401); // end of sale
      await advanceTime(259200); // 3 days

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      const offerTokensBefore = await offerToken.balanceOf(user.address);
      await originationPoolVesting.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut)), 1e6);
    });

    it("should allow claiming a proportional amount after the cliff with lower decimals", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseUnits("1", 6);
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVestingDecimals.initiateSale();
      await originationPoolVestingDecimals.connect(user).purchase(amountIn);
      await advanceTime(86401); // end of sale
      await advanceTime(216000); // 2.5 days
      const ratio = 2.5 / 3; // 2.5 days out of 3

      // get the vesting id
      const userVestingId = await originationPoolVestingDecimals.userToVestingId(user.address);

      await originationPoolVestingDecimals.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut * ratio)), 1e6);
    });

    it("should allow claiming the full amount after the cliff with lower decimals", async () => {
      // purchase tokens
      // you will receive 10x the amount you put in
      const amountIn = ethers.utils.parseUnits("1", 6);
      const expectedAmountOut = ethers.utils.parseUnits("10", 10);

      await originationPoolVestingDecimals.initiateSale();
      await originationPoolVestingDecimals.connect(user).purchase(amountIn);
      await advanceTime(86401); // end of sale
      await advanceTime(259200); // 3 days

      // get the vesting id
      const userVestingId = await originationPoolVestingDecimals.userToVestingId(user.address);

      await originationPoolVestingDecimals.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut)), 1e6);
    });

    it("should be able to claim proportional amount of vested tokens after cliff if offer token amount is reached", async () => {
      // disable whitelist
      await originationPoolVesting.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
      const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

      // initiate sale
      await originationPoolVesting.initiateSale();

      // offerToken = token out
      // purchaseToken = token in
      const offerBalanceBefore = await offerToken.balanceOf(user.address);
      expect(offerBalanceBefore).to.equal(0);

      await increaseTime(1);
      // Get the purchase token amount required to buy all offered tokens
      let purchaseTokenAmount = await originationPoolVesting.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

      // purchase exceeds sale ceiling by 10%
      let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
      await originationPoolVesting.connect(user).purchase(bigPurchaseAmount);

      // sale is over now (sold out)
      // advance time after cliff period
      await advanceTime(216000); // 2.5 days
      const ratio = 2.5 / 3; // 2.5 days out of 3

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      const offerTokensBefore = await offerToken.balanceOf(user.address);
      await originationPoolVesting.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(totalOfferingAmount * ratio)), 1e6);
    });

    it("should be able to claim full amount of vested tokens after vesting if offer token amount is reached", async () => {
      // disable whitelist
      await originationPoolVesting.setWhitelist([false, ethers.utils.formatBytes32String("0"), 0]);
      const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m

      // initiate sale
      await originationPoolVesting.initiateSale();

      // offerToken = token out
      // purchaseToken = token in
      const offerBalanceBefore = await offerToken.balanceOf(user.address);
      expect(offerBalanceBefore).to.equal(0);

      await increaseTime(1);
      // Get the purchase token amount required to buy all offered tokens
      let purchaseTokenAmount = await originationPoolVesting.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

      // purchase exceeds sale ceiling by 10%
      let bigPurchaseAmount = purchaseTokenAmount.add(purchaseTokenAmount.div(10));
      await originationPoolVesting.connect(user).purchase(bigPurchaseAmount);

      // sale is over now (sold out)
      // advance time after cliff period
      await advanceTime(259200); // 3 days

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await originationPoolVesting.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      expect(offerTokensAfter).to.be.eq(totalOfferingAmount);
    });

    it("should mint a nft to the user after investing in pool with a vesting period", async () => {
      const amountIn = ethers.utils.parseEther("1");

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);

      let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
      let poolNFT = await ethers.getContractAt('VestingEntryNFT', poolNFTAddress);

      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      let ownerOfNFT = await poolNFT.ownerOf(userVestingId);
      expect(ownerOfNFT).to.be.eq(user.address);

      let userVestingEntry = await poolNFT.tokenIdVestingAmounts(userVestingId);
      expect(userVestingEntry.tokenAmount).not.to.be.eq(0);
      expect(userVestingEntry.tokenAmountClaimed).to.be.eq(0);
    });

    it("user should be able to transfer nft and claim vesting from another address", async () => {
      const amountIn = ethers.utils.parseEther("1");

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);

      let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
      let poolNFT = await ethers.getContractAt('VestingEntryNFT', poolNFTAddress);
      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await poolNFT.connect(user).approve(user1.address, userVestingId);
      await poolNFT.connect(user1).transferFrom(user.address, user1.address, userVestingId);

      let ownerOfNFT = await poolNFT.ownerOf(userVestingId);
      expect(ownerOfNFT).to.be.eq(user1.address);

      await advanceTime(86401); // end of sale
      await advanceTime(259200); // 3 days

      await originationPoolVesting.connect(user1).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user1.address);

      const expectedAmountOut = ethers.utils.parseUnits("10", 10);
      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut)), 1e6);      
    });

    it("user shouldn\'t be able to transfer nft and claim vesting from his old address", async () => {
      const amountIn = ethers.utils.parseEther("1");

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);

      let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
      let poolNFT = await ethers.getContractAt('VestingEntryNFT', poolNFTAddress);
      // get the vesting id
      const userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await poolNFT.connect(user).approve(user1.address, userVestingId);
      await poolNFT.connect(user1).transferFrom(user.address, user1.address, userVestingId);

      let ownerOfNFT = await poolNFT.ownerOf(userVestingId);
      expect(ownerOfNFT).to.be.eq(user1.address);

      await advanceTime(86401); // end of sale
      await advanceTime(259200); // 3 days

      await expect(originationPoolVesting.connect(user).claimVested([userVestingId])).
        to.be.revertedWith('User not owner of vest id')    
    });

    it("user should be able to transfer nft, make another investment and claim vesting from his address", async () => {
      const amountIn = ethers.utils.parseEther("1");

      await originationPoolVesting.initiateSale();
      await originationPoolVesting.connect(user).purchase(amountIn);

      let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
      let poolNFT = await ethers.getContractAt('VestingEntryNFT', poolNFTAddress);
      // get the vesting id
      let userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await poolNFT.connect(user).approve(user1.address, userVestingId);
      await poolNFT.connect(user1).transferFrom(user.address, user1.address, userVestingId);

      let ownerOfNFT = await poolNFT.ownerOf(userVestingId);
      expect(ownerOfNFT).to.be.eq(user1.address);

      await originationPoolVesting.connect(user).purchase(amountIn);

      await advanceTime(86401); // end of sale
      await advanceTime(259200); // 3 days
      
      userVestingId = await originationPoolVesting.userToVestingId(user.address);

      await originationPoolVesting.connect(user).claimVested([userVestingId]);
      const offerTokensAfter = await offerToken.balanceOf(user.address);

      const expectedAmountOut = ethers.utils.parseUnits("10", 10);
      expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut)), 1e6);      
    });
  });
});
