const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./nftFixture");
const { advanceTime } = require("../utils");
const { increaseTime, getMerkleWhitelist, bn } = require("../../scripts/helpers");

describe("NFT whitelisted sale with erc-20 token as payment", async () => {
    beforeEach(async () => {
      ({
        accounts,
        purchaseToken,
        originationPoolWhitelist,
        listedNftWhitelist,
        whitelistMintPrice,
        tokenMintPrice,
        whitelistRoot,
        deployerProof,
        userProof,
        user1Proof
      } = await createFixture());
      [deployer, user, user1, user2, user3] = accounts;
    });

    it("should successfully mint nft from whitelisted address", async () => {
        await originationPoolWhitelist.initiateSale();

        await originationPoolWhitelist.connect(user).whitelistMint(1, userProof);

        let fee = await originationPoolWhitelist.originationFee(); // 1e18 = 100% fee
        let costExpected = await originationPoolWhitelist.getCurrentMintPrice();
        let feeExpected = costExpected.mul(fee).div(bn(10).pow(18));

        let acquiredTokens = await originationPoolWhitelist.purchaseTokensAcquired();
        let feesAccumulated = await originationPoolWhitelist.originationCoreFees();
        let totalMints = await originationPoolWhitelist.totalMints();

        let userNFTBalance = await listedNftWhitelist.balanceOf(user.address);

        expect(acquiredTokens).to.be.eq(costExpected);
        expect(feesAccumulated).to.be.eq(feeExpected);
        expect(totalMints).to.be.eq(1);
        expect(userNFTBalance).to.be.eq(1);
    });

    // Batch minting depends on NFT implementation
    it("should be able to mint more than one nft", async () => {
        await originationPoolWhitelist.initiateSale();
        
        await originationPoolWhitelist.connect(user).whitelistMint(3, userProof);

        let balance = await listedNftWhitelist.balanceOf(user.address);
        expect(balance).to.be.eq(3);
    });

    it('whitelist mint price and public mint price should be different', async () => {
        await originationPoolWhitelist.initiateSale();

        let bb = await purchaseToken.balanceOf(user.address);
        await originationPoolWhitelist.connect(user).whitelistMint(1, userProof);
        let ba = await purchaseToken.balanceOf(user.address);
        let sentWhitelist = bb.sub(ba);

        await increaseTime(259200);

        bb = await purchaseToken.balanceOf(user.address);
        await originationPoolWhitelist.connect(user).publicMint(1);
        ba = await purchaseToken.balanceOf(user.address);
        let sent = bb.sub(ba);

        expect(sent).to.be.gt(sentWhitelist);
        expect(sent).to.be.eq(tokenMintPrice);
        expect(sentWhitelist).to.be.eq(whitelistMintPrice);
    });

    it("shouldn't be able to mint more than user mint limit", async () => {
        await originationPoolWhitelist.initiateSale();
        
        let userLimit = 10;
        await expect(originationPoolWhitelist.connect(user).whitelistMint(userLimit + 1, userProof)).
            to.be.revertedWith('User mint cap reached');
    });

    it("shouldn't be able to mint more than max whitelist mintable", async () => {
        await originationPoolWhitelist.initiateSale();
        
        // limit is set to 20 in fixture
        let userLimit = 10;
        await originationPoolWhitelist.connect(deployer).whitelistMint(userLimit, deployerProof);
        await originationPoolWhitelist.connect(user).whitelistMint(userLimit, userProof);
        await expect(originationPoolWhitelist.connect(user1).whitelistMint(1, user1Proof)).
            to.be.revertedWith('Exceeds whitelist supply')
    });

    it("shouldn't be able to mint nft before sale start", async () => {
        await expect(originationPoolWhitelist.connect(user).whitelistMint(1, userProof)).
            to.be.revertedWith('Not whitelist period')
    });

    it("shouldn't be able to mint nft after whitelist period end", async () => {
        await originationPoolWhitelist.initiateSale();
        await increaseTime(259200);
        await expect(originationPoolWhitelist.connect(user).whitelistMint(1, userProof)).
            to.be.revertedWith('Not whitelist period')
    });

    it("shouldn't be able to mint if not whitelisted", async () => {
        await originationPoolWhitelist.initiateSale();

        await expect(originationPoolWhitelist.connect(user3).whitelistMint(1, userProof)).
            to.be.revertedWith('Address not whitelisted')
    });

    it("shouldn't be able to mint if wrong proof is sent", async () => {
        await originationPoolWhitelist.initiateSale();

        await expect(originationPoolWhitelist.connect(user).whitelistMint(1, deployerProof)).
            to.be.revertedWith('Address not whitelisted')
    });
  });