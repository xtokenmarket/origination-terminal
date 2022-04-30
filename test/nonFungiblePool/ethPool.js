const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./nftFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist, bn, getBalance } = require("../../scripts/helpers");

describe("NFT sale with ETH as payment", async () => {
    beforeEach(async () => {
      ({
        accounts,
        purchaseToken,
        originationPoolETH,
        listedNftETHPool
      } = await createFixture());
      [deployer, user] = accounts;
    });

    it("should successfully mint nft", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETH.getCurrentMintPrice();
        await originationPoolETH.connect(user).publicMint(1, {value: price});

        let fee = await originationPoolETH.originationFee(); // 1e18 = 100% fee
        let costExpected = await originationPoolETH.getCurrentMintPrice();
        let feeExpected = costExpected.mul(fee).div(bn(10).pow(18));

        let acquiredTokens = await originationPoolETH.purchaseTokensAcquired();
        let feesAccumulated = await originationPoolETH.originationCoreFees();
        let totalMints = await originationPoolETH.totalMints();

        let userNFTBalance = await listedNftETHPool.balanceOf(user.address);

        expect(acquiredTokens).to.be.eq(costExpected);
        expect(feesAccumulated).to.be.eq(feeExpected);
        expect(totalMints).to.be.eq(1);
        expect(userNFTBalance).to.be.eq(1);
    });

    // Batch minting depends on NFT implementation
    it("should be able to mint more than one nft", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETH.getCurrentMintPrice();
        let cost = price.mul(3);
        
        await originationPoolETH.connect(user).publicMint(3, {value: cost});

        let balance = await listedNftETHPool.balanceOf(user.address);
        expect(balance).to.be.eq(3);
    })

    // Batch minting depends on NFT implementation
    it("should receive eth back if accidentally sent more", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETH.getCurrentMintPrice();
        let cost = price.mul(3);
        
        // sent cost * 2 eth to function, but *cost* was refunded 
        await expect(await originationPoolETH.connect(user).publicMint(3, {value: cost.mul(2)})).
            to.changeEtherBalance(user, cost.mul(-1));
    })

    it("shouldn't be able to mint with less eth than required", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETH.getCurrentMintPrice();
        await expect(originationPoolETH.connect(user).publicMint(1, {value: price.sub(1)})).
            to.be.revertedWith('Insufficient payment')
    });

    it("shouldn't be able to mint nft before sale start", async () => {
        await expect(originationPoolETH.connect(user).publicMint(1)).
            to.be.revertedWith('Not public mint period')
    });

    it("shouldn't be able to mint nft after sale end", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(604800);
        await expect(originationPoolETH.connect(user).publicMint(1)).
            to.be.revertedWith('Not public mint period')
    });

    it("shouldn't be able to mint more than mint cap", async () => {
        await originationPoolETH.initiateSale();

        await expect(originationPoolETH.connect(user).publicMint(1001)).
            to.be.revertedWith('Total mint cap reached')
    });

    it("owner should be able to retrieve invested tokens after sale end", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETH.getCurrentMintPrice();
        await originationPoolETH.connect(user).publicMint(3, {value: price.mul(3)});

        await increaseTime(604800) // sale end
        let originationCoreFees = await originationPoolETH.originationCoreFees();
        let poolBalance = await getBalance(originationPoolETH);
        let claimAmount = poolBalance.sub(originationCoreFees);
        
        await expect(await originationPoolETH.claimPurchaseTokens()).
            to.changeEtherBalance(deployer, claimAmount);
    })

    it("owner shouldn't be able to retrieve invested tokens twice", async () => {
        await originationPoolETH.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETH.getCurrentMintPrice();
        await originationPoolETH.connect(user).publicMint(3, {value: price.mul(3)});

        await increaseTime(604800) // sale end
        await expect(originationPoolETH.claimPurchaseTokens()).not.to.be.reverted;
        await expect(originationPoolETH.claimPurchaseTokens()).to.be.revertedWith('Tokens already claimed');
    })
  });