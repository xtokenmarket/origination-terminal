const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./nftFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist } = require("../../scripts/helpers");

describe("NFT sale management functions", async () => {
    beforeEach(async () => {
      ({
        accounts,
        purchaseToken,
        originationPool,
        listedNft,
        whitelistRoot
      } = await createFixture());
      [deployer, user] = accounts;
    });

    it("should successfully initiate sale", async () => {
        await expect(originationPool.initiateSale()).not.to.be.reverted;

        let saleInitiated = await originationPool.saleInitiated();
        expect(saleInitiated).to.be.eq(true);
    });

    it("shouldn't be able to initiate sale twice", async () => {
        await expect(originationPool.initiateSale()).not.to.be.reverted;
        await expect(originationPool.initiateSale()).to.be.revertedWith('Sale already initiated');
    });

    it("only owner or manager should be able to initiate sale twice", async () => {
        await expect(originationPool.connect(user).initiateSale()).to.be.revertedWith('Not owner or manager');
    });

    it("should be able to set a whitelist", async () => {
        await expect(originationPool.setWhitelist(whitelistRoot)).not.to.be.reverted;
        let root = await originationPool.whitelistMerkleRoot();
        expect(root).to.be.eq(whitelistRoot);
    });

    it("shouldn't be able to set a whitelist after sale has started", async () => {
        await originationPool.initiateSale();
        await expect(originationPool.setWhitelist(whitelistRoot)).
          to.be.revertedWith('Cannot set whitelist after sale initiated');
    });

    it("owner should be able to claim tokens at sale end", async () => {
        await originationPool.initiateSale();
        await increaseTime(604800);
        await originationPool.claimPurchaseTokens();
    });

    it("owner shouldn't be able to claim tokens if sale isn't over", async () => {
        await originationPool.initiateSale();
        await increaseTime(604700);
        await expect(originationPool.claimPurchaseTokens()).to.be.revertedWith('Sale has not ended');
    });

    it("owner should be able to set a manager", async () => {
        await originationPool.setManager(user.address);
        let manager = await originationPool.manager();
        expect(manager).to.be.eq(user.address);
    });
  });