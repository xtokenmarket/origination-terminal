const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./nftFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist, bn } = require("../../scripts/helpers");

describe("NFT whitelisted sale with ETH as payment", async () => {
    beforeEach(async () => {
      ({
        accounts,
        purchaseToken,
        originationPoolETHWhitelist,
        listedNftETHPoolWhitelist,
        ethMintPriceWhitelist,
        ethMintPrice,
        whitelistRoot,
        deployerProof,
        userProof,
        user1Proof
      } = await createFixture());
      [deployer, user, user1, user2, user3] = accounts;
    });

    it("should successfully mint nft from whitelisted address", async () => {
        await originationPoolETHWhitelist.initiateSale();
        await increaseTime(1);

        let mintPrice = await originationPoolETHWhitelist.getCurrentMintPrice();
        await originationPoolETHWhitelist.connect(user).whitelistMint(1, userProof, {value: mintPrice});

        let fee = await originationPoolETHWhitelist.originationFee(); // 1e18 = 100% fee
        let costExpected = await originationPoolETHWhitelist.getCurrentMintPrice();
        let feeExpected = costExpected.mul(fee).div(bn(10).pow(18));

        let acquiredTokens = await originationPoolETHWhitelist.purchaseTokensAcquired();
        let feesAccumulated = await originationPoolETHWhitelist.originationCoreFees();
        let totalMints = await originationPoolETHWhitelist.totalMints();

        let userNFTBalance = await listedNftETHPoolWhitelist.balanceOf(user.address);

        expect(acquiredTokens).to.be.eq(costExpected);
        expect(feesAccumulated).to.be.eq(feeExpected);
        expect(totalMints).to.be.eq(1);
        expect(userNFTBalance).to.be.eq(1);
    });

    // Batch minting depends on NFT implementation
    it("should be able to mint more than one nft", async () => {
        await originationPoolETHWhitelist.initiateSale();
        
        await increaseTime(1);

        let mintPrice = await originationPoolETHWhitelist.getCurrentMintPrice();
        await originationPoolETHWhitelist.connect(user).whitelistMint(3, userProof, {value: mintPrice.mul(3)});

        let balance = await listedNftETHPoolWhitelist.balanceOf(user.address);
        expect(balance).to.be.eq(3);
    });

    it("should receive eth back if accidentally sent more", async () => {
        await originationPoolETHWhitelist.initiateSale();
        await increaseTime(1);

        let price = await originationPoolETHWhitelist.getCurrentMintPrice();
        let cost = price.mul(3);
        
        // sent cost * 2 eth to function, but *cost* was refunded 
        await expect(await originationPoolETHWhitelist.connect(user).
            whitelistMint(3, userProof, {value: cost.mul(2)})).
            to.changeEtherBalance(user, cost.mul(-1));
    })

    it('whitelist mint price and public mint price should be different', async () => {
        await originationPoolETHWhitelist.initiateSale();
        
        await increaseTime(1);

        let mintPrice = await originationPoolETHWhitelist.getCurrentMintPrice();

        await expect(await originationPoolETHWhitelist.connect(user).
            whitelistMint(1, userProof, {value: mintPrice})).
            to.changeEtherBalance(user, ethMintPriceWhitelist.mul(-1));

        await increaseTime(259200);

        mintPrice = await originationPoolETHWhitelist.getCurrentMintPrice();
        await expect(await originationPoolETHWhitelist.connect(user).
            publicMint(1, {value: mintPrice})).
            to.changeEtherBalance(user, ethMintPrice.mul(-1));
    });

    it("shouldn't be able to mint more than user mint limit", async () => {
        await originationPoolETHWhitelist.initiateSale();
        
        await increaseTime(1);

        let mintPrice = await originationPoolETHWhitelist.getCurrentMintPrice();
        let userLimit = 10;
        await expect(originationPoolETHWhitelist.connect(user).
            whitelistMint(userLimit + 1, userProof, {value: mintPrice.mul(userLimit + 1)})).
            to.be.revertedWith('User mint cap reached');
    });

    it("shouldn't be able to mint more than max whitelist mintable", async () => {
        await originationPoolETHWhitelist.initiateSale();
        
        await increaseTime(1);

        let mintPrice = await originationPoolETHWhitelist.getCurrentMintPrice();
        // limit is set to 20 in fixture
        let userLimit = 10;
        await originationPoolETHWhitelist.connect(deployer).
            whitelistMint(userLimit, deployerProof, {value: mintPrice.mul(userLimit)});
        await originationPoolETHWhitelist.connect(user).
            whitelistMint(userLimit, userProof, {value: mintPrice.mul(userLimit)});
        await expect(originationPoolETHWhitelist.connect(user1).
            whitelistMint(1, user1Proof, {value: mintPrice})).
            to.be.revertedWith('Exceeds whitelist supply')
    });

    it("shouldn't be able to mint nft before sale start", async () => {
        await expect(originationPoolETHWhitelist.connect(user).whitelistMint(1, userProof)).
            to.be.revertedWith('Not whitelist period')
    });

    it("shouldn't be able to mint nft after whitelist period end", async () => {
        await originationPoolETHWhitelist.initiateSale();
        await increaseTime(259200);
        await expect(originationPoolETHWhitelist.connect(user).whitelistMint(1, userProof)).
            to.be.revertedWith('Not whitelist period')
    });

    it("shouldn't be able to mint if not whitelisted", async () => {
        await originationPoolETHWhitelist.initiateSale();

        await expect(originationPoolETHWhitelist.connect(user3).whitelistMint(1, userProof)).
            to.be.revertedWith('Address not whitelisted')
    });

    it("shouldn't be able to mint if wrong proof is sent", async () => {
        await originationPoolETHWhitelist.initiateSale();

        await expect(originationPoolETHWhitelist.connect(user).whitelistMint(1, deployerProof)).
            to.be.revertedWith('Address not whitelisted')
    });
  });