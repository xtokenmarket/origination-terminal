const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./nftFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist } = require("../../scripts/helpers");

describe("NFT sale view functions", async () => {
    beforeEach(async () => {
      ({
        accounts,
        originationCore,
        purchaseToken,
        originationPool,
        listedNft,
        whitelistRoot,
        deployerProof,
        userProof
      } = await createFixture());
      [deployer, user] = accounts;
    });

    it("should be able to retrieve mint price", async () => {
        await originationPool.initiateSale();
        await increaseTime(1);

        let mintPrice = await originationPool.getCurrentMintPrice();
        expect(mintPrice).not.to.be.eq(0);
    });

    it("should be able to retrieve if whitelist mint period", async () => {
        await originationPool.initiateSale();
        await increaseTime(1);

        let whitelistPeriod = await originationPool.isWhitelistMintPeriod();
        expect(whitelistPeriod).to.be.eq(false);
    });

    it("should be able to retrieve if public mint period", async () => {
        await originationPool.initiateSale();
        await increaseTime(1);

        let publicMintPeriod = await originationPool.isPublicMintPeriod();
        expect(publicMintPeriod).to.be.eq(true);
    });

    it("shouldn't be able to retrieve mint price if sale is not started", async () => {
        await expect(originationPool.getCurrentMintPrice()).to.be.revertedWith('Inactive sale');
    });

    it("shouldn't be able to retrieve mint price if sale is over", async () => {
        await originationPool.initiateSale();
        await increaseTime(604801);
        await expect(originationPool.getCurrentMintPrice()).to.be.revertedWith('Inactive sale');
    });
  });