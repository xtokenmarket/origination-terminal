const { expect } = require("chai");
const { ethers } = require("hardhat");
const createFixture = require("./fixture");
const { advanceTime } = require("./utils");

describe("OriginationCore", async () => {
  let deployer, user;

  let originationCore;
  let originationPool;
  let originationPoolUpgrade;

  let purchaseToken;
  let offerToken;

  beforeEach(async () => {
    ({ accounts, originationCore, originationPool, originationPoolUpgrade, purchaseToken, offerToken } =
      await createFixture());
    [deployer, user] = accounts;
  });

  it("should successfully change the implementation contract address", async () => {
    const poolDeployerAddress = await originationCore.poolDeployer();
    const poolDeployer = await ethers.getContractAt("PoolDeployer", poolDeployerAddress);
    const addressBefore = await poolDeployer.fungibleOriginationPoolImplementation();
    expect(addressBefore).to.not.equal(originationPoolUpgrade.address);

    await poolDeployer.setFungibleOriginationPoolImplementation(originationPoolUpgrade.address);

    const addressAfter = await poolDeployer.fungibleOriginationPoolImplementation();
    expect(addressAfter).to.equal(originationPoolUpgrade.address);
  });

  it("should successfully upgrade the origination pool to latest version", async () => {
    const poolDeployerAddress = await originationCore.poolDeployer();
    const poolDeployer = await ethers.getContractAt("PoolDeployer", poolDeployerAddress);
    await poolDeployer.setFungibleOriginationPoolImplementation(originationPoolUpgrade.address);

    // upgrade to latest
    const proxyAdminAddress = await originationCore.proxyAdmin();
    const proxyAdmin = await ethers.getContractAt("OriginationProxyAdmin", proxyAdminAddress);
    const implementation = await poolDeployer.fungibleOriginationPoolImplementation();
    await proxyAdmin.upgrade(originationPool.address, implementation);

    const upgradedPool = await ethers.getContractAt("OriginationPoolUpgrade", originationPool.address);
    const upgradeResult = await upgradedPool.newFunction();
    expect(upgradeResult).to.equal(10);
  });

  it("should successfully claim fees as revenue controller", async () => {
    // purchase tokens
    // disable whitelist
    await originationPool.setWhitelist(ethers.utils.formatBytes32String("0"));
    // initiate sale
    await originationPool.initiateSale();
    await originationPool.purchase(ethers.utils.parseEther("1"));
    await advanceTime(86401);
    await originationPool.claimPurchaseToken();
    const feeAmountEth = await ethers.provider.getBalance(originationCore.address);
    const feeAmountToken = await purchaseToken.balanceOf(originationCore.address);
    expect(feeAmountToken).to.not.equal(0);

    await expect(await originationCore.claimFees("0x0000000000000000000000000000000000000000")).to.changeEtherBalance(
      deployer,
      feeAmountEth
    );

    const revenuControllerBalanceBefore = await purchaseToken.balanceOf(deployer.address);
    await originationCore.claimFees(purchaseToken.address);
    const revenuControllerBalanceAfter = await purchaseToken.balanceOf(deployer.address);

    expect(feeAmountToken).to.equal(revenuControllerBalanceAfter.sub(revenuControllerBalanceBefore));
  });

  it("should successfully set the listing fee", async () => {
    const newListingFee = ethers.utils.parseEther("0.02");
    expect(await originationCore.listingFee()).to.not.equal(newListingFee);

    await originationCore.setListingFee(newListingFee);
    expect(await originationCore.listingFee()).to.equal(newListingFee);
  });

  it("should be able to set a custom listing fee for an address", async () => {
    const customListingFee = ethers.utils.parseEther("0.002");
    const address = user.address;
    expect(await originationCore.customListingFeeEnabled(address)).to.equal(false);
    expect(await originationCore.customListingFee(address)).to.not.equal(customListingFee);

    await originationCore.enableCustomListingFee(address, customListingFee);
    expect(await originationCore.customListingFeeEnabled(address)).to.equal(true);
    expect(await originationCore.customListingFee(address)).to.equal(customListingFee);
  });

  it("should be able to disable a custom listing fee for an address", async () => {
    const customListingFee = ethers.utils.parseEther("0.002");
    const address = user.address;
    expect(await originationCore.customListingFeeEnabled(address)).to.equal(false);
    expect(await originationCore.customListingFee(address)).to.not.equal(customListingFee);

    await originationCore.enableCustomListingFee(address, customListingFee);
    expect(await originationCore.customListingFeeEnabled(address)).to.equal(true);
    expect(await originationCore.customListingFee(address)).to.equal(customListingFee);

    await originationCore.disableCustomListingFee(address);
    expect(await originationCore.customListingFeeEnabled(address)).to.equal(false);
  });

  it("shouldn't be able to set a custom listing fee higher than the current listing fee for an address", async () => {
    const customListingFee = ethers.utils.parseEther("0.02");
    const address = user.address;
    expect(await originationCore.customListingFeeEnabled(address)).to.equal(false);
    expect(await originationCore.customListingFee(address)).to.not.equal(customListingFee);

    await expect(originationCore.enableCustomListingFee(address, customListingFee)).
      to.be.revertedWith('Custom fee should be less than flat deployment fee');
  });

  it("should fail to create a listing with invalid params", async () => {
    const listingFee = await originationCore.listingFee();
    await expect(
      originationCore.createFungibleListing(
        {
          offerToken: offerToken.address,
          purchaseToken: purchaseToken.address,
          startingPrice: 0, // starting price
          endingPrice: 0, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 3024000, // duration greater than 4 weeks
          whitelistSaleDuration: 0, // duration of 24 hours
          totalOfferingAmount: 0,
          reserveAmount: 0,
          vestingPeriod: 0,
          cliffPeriod: 0,
        },
        { value: listingFee }
      )
    ).to.be.revertedWith("Invalid sale duration");
  });
});
