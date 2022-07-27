const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fungibleFixture");
const { advanceTime } = require("../utils");
const { BigNumber } = require("ethers");
const { increaseTime, bnDecimal } = require("../../scripts/helpers");

describe("Fungible token sale vesting", async () => {
  beforeEach(async () => {
    ({ accounts, originationCore, purchaseToken, offerToken, originationPoolVesting, originationPoolVestingDecimals, rootHash, deployerProof, userProof } =
      await createFixture());
    [deployer, user, user1] = accounts;
  });

  it("should not allow claim vested if no vesting entry NFT id was provided", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("0.1");
    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await advanceTime(216000); // 2.5 days

    await expect(originationPoolVesting.claimVested([])).to.be.revertedWith("No vesting entry NFT id provided");
  });

  it("should fail to claim vested tokens before sale has ended", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");
    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);

    // get the vesting id
    const userVestingId = await originationPoolVesting.userToVestingId(user.address);

    await expect(originationPoolVesting.claimVested([userVestingId])).to.be.revertedWith("Not past cliff period");
  });

  it("should fail to claim vested tokens before cliff period", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");

    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);
    await advanceTime(86401);

    // get the vesting id
    const userVestingId = await originationPoolVesting.userToVestingId(user.address);

    await expect(originationPoolVesting.connect(user).claimVested([userVestingId])).to.be.revertedWith("Not past cliff period");
  });

  it("should fail to claim vested tokens if the reserve amount is not met", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("0.1");
    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);
    await advanceTime(86401);
    await advanceTime(216000); // 2.5 days

    // get the vesting id
    const userVestingId = await originationPoolVesting.userToVestingId(user.address);

    await expect(originationPoolVesting.claimVested([userVestingId])).to.be.revertedWith("Sale reserve amount not met");
  });

  it("should fail to claim vested tokens if they do not belong to user", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("1");

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

    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);
    await advanceTime(86401); // end of sale
    await advanceTime(216000); // 2.5 days

    // claim tokens can only be used with non-vesting pools
    await expect(originationPoolVesting.connect(user).claimTokens()).to.be.revertedWith("Tokens must be claimed using claimVested");
  });

  it("should not alow the user claim vested tokens multiple times", async () => {
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

    await originationPoolVesting.connect(user).claimVested([userVestingId]);
    const offerTokensAfter = await offerToken.balanceOf(user.address);

    expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut)), 1e6);

    await expect(originationPoolVesting.connect(user).claimVested([userVestingId])).to.be.revertedWith("User has already claimed their token vesting");
  });

  it("should return purchase tokens if sale did not meet reserve amount", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in
    const amountIn = ethers.utils.parseEther("0.5");

    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);
    await advanceTime(86401);

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
    await originationPoolVesting.setWhitelist(ethers.utils.formatBytes32String("0"));
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

    await originationPoolVesting.connect(user).claimVested([userVestingId]);
    const offerTokensAfter = await offerToken.balanceOf(user.address);

    expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(totalOfferingAmount * ratio)), 1e6);
  });

  it("should be able to claim full amount of vested tokens after vesting if offer token amount is reached", async () => {
    // disable whitelist
    await originationPoolVesting.setWhitelist(ethers.utils.formatBytes32String("0"));
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
    let poolNFT = await ethers.getContractAt("VestingEntryNFT", poolNFTAddress);

    // get the vesting id
    const userVestingId = await originationPoolVesting.userToVestingId(user.address);

    let ownerOfNFT = await poolNFT.ownerOf(userVestingId);
    expect(ownerOfNFT).to.be.eq(user.address);

    let userVestingEntry = await poolNFT.tokenIdVestingAmounts(userVestingId);
    expect(userVestingEntry.tokenAmount).not.to.be.eq(0);
    expect(userVestingEntry.tokenAmountClaimed).to.be.eq(0);
  });

  it("should not mint vesting entry for zero pruchased offer amount - total offering amount is already reached", async () => {
    const totalOfferingAmount = await originationPoolVesting.totalOfferingAmount();
    const poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
    const poolNFT = await ethers.getContractAt("VestingEntryNFT", poolNFTAddress);

    // initiate sale
    await originationPoolVesting.initiateSale();

    await increaseTime(1);
    // Get the purchase token amount required to buy all offered tokens
    const purchaseTokenAmount = await originationPoolVesting.getPurchaseAmountFromOfferAmount(totalOfferingAmount);

    // Purchase all offer tokens
    const tx = await originationPoolVesting.connect(user).purchase(purchaseTokenAmount);
    const callTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

    // Get the vesting id
    const userVestingId = await originationPoolVesting.userToVestingId(user.address);

    const ownerOfNFT = await poolNFT.ownerOf(userVestingId);
    expect(ownerOfNFT).to.be.eq(user.address);

    const userVestingEntry = await poolNFT.tokenIdVestingAmounts(userVestingId);

    expect(userVestingEntry.tokenAmount).to.be.eq(totalOfferingAmount);
    expect(userVestingEntry.tokenAmountClaimed).to.be.eq(0);

    // Try purchase again
    await expect(originationPoolVesting.connect(user).purchase(ethers.utils.parseEther("1"))).to.be.revertedWith("Sale over");

    expect(await originationPoolVesting.saleEndTimestamp()).to.eq(callTimestamp);
    expect(await originationPoolVesting.userToVestingId(user.address)).to.eq(userVestingId);
  });

  it("user should be able to transfer nft and claim vesting from another address", async () => {
    const amountIn = ethers.utils.parseEther("1");

    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);

    let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
    let poolNFT = await ethers.getContractAt("VestingEntryNFT", poolNFTAddress);
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

  it("user shouldn't be able to transfer nft and claim vesting from their old address", async () => {
    const amountIn = ethers.utils.parseEther("1");

    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);

    let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
    let poolNFT = await ethers.getContractAt("VestingEntryNFT", poolNFTAddress);
    // get the vesting id
    const userVestingId = await originationPoolVesting.userToVestingId(user.address);

    await poolNFT.connect(user).approve(user1.address, userVestingId);
    await poolNFT.connect(user1).transferFrom(user.address, user1.address, userVestingId);

    let ownerOfNFT = await poolNFT.ownerOf(userVestingId);
    expect(ownerOfNFT).to.be.eq(user1.address);

    await advanceTime(86401); // end of sale
    await advanceTime(259200); // 3 days

    await expect(originationPoolVesting.connect(user).claimVested([userVestingId])).to.be.revertedWith("User not owner of vest id");
  });

  it("user should be able to transfer nft, make another investment and claim vesting from their address", async () => {
    const amountIn = ethers.utils.parseEther("1");

    await originationPoolVesting.initiateSale();
    await originationPoolVesting.connect(user).purchase(amountIn);

    let poolNFTAddress = await originationPoolVesting.vestingEntryNFT();
    let poolNFT = await ethers.getContractAt("VestingEntryNFT", poolNFTAddress);
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

  it("only pool should be able to interact with vesting entry nft", async () => {
    let vestingEntryNFTAddress = await originationPoolVesting.vestingEntryNFT();
    let vestingEntryNFT = await ethers.getContractAt("VestingEntryNFT", vestingEntryNFTAddress);
    await expect(
      vestingEntryNFT.connect(user).mint(user.address, 0, {
        tokenAmount: bnDecimal(1000000),
        tokenAmountClaimed: 0,
      })
    ).to.be.revertedWith("Only pool can interact with vesting entries");
  });

  it("should be able to claim full vested amount if user purchased multiple times", async () => {
    // purchase tokens
    // you will receive 10x the amount you put in

    const contributions = ["0.2", "0.1", "0.3", "0.1", "0.3"].map(ethers.utils.parseEther);
    const vestingEntriesIds = [];

    await originationPoolVesting.initiateSale();

    for (const contribution of contributions) {
      await originationPoolVesting.connect(user).purchase(contribution);
      vestingEntriesIds.push(await originationPoolVesting.userToVestingId(user.address));
    }

    await advanceTime(86401); // end of sale
    await advanceTime(259200); // 3 days

    // get the vesting id
    await originationPoolVesting.connect(user).claimVested(vestingEntriesIds);
    const offerTokensAfter = await offerToken.balanceOf(user.address);
    const expectedAmountOut = ethers.utils.parseUnits("10", 10);

    expect(offerTokensAfter).to.be.closeTo(BigNumber.from(Math.round(expectedAmountOut)), 1e6);
  });

  describe(".calcultateClaimableVestedAmount() output", async () => {
    it("should not be able to get the claimable vested amount if cliff period not passed", async () => {
      await originationPoolVesting.initiateSale();
      await expect(originationPoolVesting.calculateClaimableVestedAmount(ethers.utils.parseEther("0.1"), 0)).to.be.revertedWith("Not past cliff period");
    });

    it("should calculate correct proportional amount right after cliff period", async () => {
      const offerTokenAmount = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();
      await advanceTime(86401); // end of sale
      await advanceTime(216000); // 2.5 days
      const ratio = 2.5 / 3; // 2.5 days out of 3

      // No token amount already claimed
      const claimableVestedAmount = await originationPoolVesting.calculateClaimableVestedAmount(offerTokenAmount, 0);
      expect(claimableVestedAmount).to.be.closeTo(BigNumber.from(Math.round(offerTokenAmount * ratio)), 1e6);

      // Token amount already claimed
      const claimableAmount = await originationPoolVesting.calculateClaimableVestedAmount(offerTokenAmount, 0);
      expect(claimableAmount.sub(1000)).to.be.closeTo(BigNumber.from(Math.round(offerTokenAmount.sub(1000) * ratio)), 1e6);
    });

    it("should calculate correct claimable vested amount after vesting period", async () => {
      const offerTokenAmount = ethers.utils.parseUnits("10", 10);

      await originationPoolVesting.initiateSale();

      await advanceTime(86401); // end of sale
      await advanceTime(259201); // 3 days

      // No token amount already claimed
      const claimableVestedAmount = await originationPoolVesting.calculateClaimableVestedAmount(offerTokenAmount, 0);
      expect(claimableVestedAmount).to.be.equal(offerTokenAmount);

      // Token amount already claimed
      const alreadyClaimedAmount = BigNumber.from(1000);
      const claimableAmount = await originationPoolVesting.calculateClaimableVestedAmount(offerTokenAmount, 0);
      expect(claimableAmount.sub(alreadyClaimedAmount)).to.be.equal(offerTokenAmount.sub(alreadyClaimedAmount));
    });
  });
});
