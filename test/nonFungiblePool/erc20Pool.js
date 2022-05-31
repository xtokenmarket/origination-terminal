const { expect } = require("chai");
const createFixture = require("./nftFixture");
const { increaseTime, bn } = require("../../scripts/helpers");

describe("NFT sale with erc-20 token as payment", async () => {
  beforeEach(async () => {
    ({ accounts, purchaseToken, originationPool, listedNft } = await createFixture());
    [deployer, user] = accounts;
  });

  it("should successfully mint nft", async () => {
    await originationPool.initiateSale();

    await originationPool.connect(user).publicMint(1);

    let fee = await originationPool.originationFee(); // 1e18 = 100% fee
    let costExpected = await originationPool.getCurrentMintPrice();
    let feeExpected = costExpected.mul(fee).div(bn(10).pow(18));

    let acquiredTokens = await originationPool.purchaseTokensAcquired();
    let feesAccumulated = await originationPool.originationCoreFees();
    let totalMints = await originationPool.totalMints();

    let userNFTBalance = await listedNft.balanceOf(user.address);

    expect(acquiredTokens).to.be.eq(costExpected);
    expect(feesAccumulated).to.be.eq(feeExpected);
    expect(totalMints).to.be.eq(1);
    expect(userNFTBalance).to.be.eq(1);
  });

  // Batch minting depends on NFT implementation
  it("should be able to mint more than one nft", async () => {
    await originationPool.initiateSale();

    await originationPool.connect(user).publicMint(3);

    let balance = await listedNft.balanceOf(user.address);
    expect(balance).to.be.eq(3);
  });

  it("shouldn't be able to mint nft before sale start", async () => {
    await expect(originationPool.connect(user).publicMint(1)).to.be.revertedWith("Not public mint period");
  });

  it("shouldn't be able to mint nft after sale end", async () => {
    await originationPool.initiateSale();
    await increaseTime(604800);
    await expect(originationPool.connect(user).publicMint(1)).to.be.revertedWith("Not public mint period");
  });

  it("shouldn't be able to mint more than mint cap", async () => {
    await originationPool.initiateSale();

    await expect(originationPool.connect(user).publicMint(1001)).to.be.revertedWith("Total mint cap reached");
  });

  it("owner should be able to retrieve invested tokens after sale end", async () => {
    await originationPool.initiateSale();
    await originationPool.connect(user).publicMint(3);

    await increaseTime(604800); // sale end
    let originationCoreFees = await originationPool.originationCoreFees();
    let poolBalance = await purchaseToken.balanceOf(originationPool.address);
    let claimAmount = poolBalance.sub(originationCoreFees);

    let ownerBalanceBefore = await purchaseToken.balanceOf(deployer.address);
    await expect(originationPool.claimPurchaseTokens()).not.to.be.reverted;
    let ownerBalanceAfter = await purchaseToken.balanceOf(deployer.address);
    let gain = ownerBalanceAfter.sub(ownerBalanceBefore);

    expect(gain).to.be.eq(claimAmount);
  });

  it("owner shouldn't be able to retrieve invested tokens twice", async () => {
    await originationPool.initiateSale();
    await originationPool.connect(user).publicMint(3);

    await increaseTime(604800); // sale end
    await expect(originationPool.claimPurchaseTokens()).not.to.be.reverted;
    await expect(originationPool.claimPurchaseTokens()).to.be.revertedWith("Tokens already claimed");
  });
});
