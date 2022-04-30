const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploy, deployArgs, bnDecimal } = require("../scripts/helpers");
const createFixture = require("./originationCoreFixture");
const { advanceTime } = require("./utils");

describe("OriginationCore", async () => {
  let deployer, user, user1;

  let originationCore;
  let originationPool;
  let originationPoolUpgrade;
  let nonFungibleOriginationPool;
  let nonFungibleOriginationPoolUpgrade;

  let purchaseToken;
  let offerToken;

  beforeEach(async () => {
    ({ accounts, originationCore, originationPool, originationPoolUpgrade, 
       nonFungibleOriginationPool, nonFungibleOriginationPoolUpgrade,
       purchaseToken, offerToken } =
      await createFixture());
    [deployer, user, user1] = accounts;
  });

  it("should successfully change the implementation contract address for fungible pools", async () => {
    const poolDeployerAddress = await originationCore.poolDeployer();
    const poolDeployer = await ethers.getContractAt("PoolDeployer", poolDeployerAddress);
    const addressBefore = await poolDeployer.fungibleOriginationPoolImplementation();
    expect(addressBefore).to.not.equal(originationPoolUpgrade.address);

    await poolDeployer.setFungibleOriginationPoolImplementation(originationPoolUpgrade.address);

    const addressAfter = await poolDeployer.fungibleOriginationPoolImplementation();
    expect(addressAfter).to.equal(originationPoolUpgrade.address);
  });

  it("should successfully upgrade the origination pool to latest version for fungible pools", async () => {
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

  it("should successfully change the implementation contract address for non fungible pools", async () => {
    const poolDeployerAddress = await originationCore.poolDeployer();
    const poolDeployer = await ethers.getContractAt("PoolDeployer", poolDeployerAddress);
    const addressBefore = await poolDeployer.nonFungibleOriginationPoolImplementation();
    expect(addressBefore).to.not.equal(nonFungibleOriginationPoolUpgrade.address);

    await poolDeployer.setNonFungibleOriginationPoolImplementation(nonFungibleOriginationPoolUpgrade.address);

    const addressAfter = await poolDeployer.nonFungibleOriginationPoolImplementation();
    expect(addressAfter).to.equal(nonFungibleOriginationPoolUpgrade.address);
  });

  it("should successfully upgrade the origination pool to latest version for non fungible pools", async () => {
    const poolDeployerAddress = await originationCore.poolDeployer();
    const poolDeployer = await ethers.getContractAt("PoolDeployer", poolDeployerAddress);
    await poolDeployer.setNonFungibleOriginationPoolImplementation(nonFungibleOriginationPoolUpgrade.address);

    // upgrade to latest
    const proxyAdminAddress = await originationCore.proxyAdmin();
    const proxyAdmin = await ethers.getContractAt("OriginationProxyAdmin", proxyAdminAddress);
    const implementation = await poolDeployer.nonFungibleOriginationPoolImplementation();
    await proxyAdmin.upgrade(nonFungibleOriginationPool.address, implementation);

    const upgradedPool = await ethers.getContractAt("OriginationPoolUpgrade", nonFungibleOriginationPool.address);
    const upgradeResult = await upgradedPool.newFunction();
    expect(upgradeResult).to.equal(10);
  });

  it("should successfully claim fees as revenue controller", async () => {
    // initiate sale
    await originationPool.initiateSale();
    await originationPool.purchase(ethers.utils.parseEther("1"));
    await advanceTime(86401);
    await originationPool.claimPurchaseToken();
    const feeAmountEth = await ethers.provider.getBalance(originationCore.address);
    const feeAmountToken = await purchaseToken.balanceOf(originationCore.address);
    expect(feeAmountToken).to.not.equal(0);

    await expect(await originationCore.claimFees("0x0000000000000000000000000000000000000000")).
    to.changeEtherBalance(
      deployer,
      feeAmountEth
    );

    const revenuControllerBalanceBefore = await purchaseToken.balanceOf(deployer.address);
    await originationCore.claimFees(purchaseToken.address);
    const revenuControllerBalanceAfter = await purchaseToken.balanceOf(deployer.address);

    expect(feeAmountToken).to.equal(revenuControllerBalanceAfter.sub(revenuControllerBalanceBefore));
  });

  it("shouldn't be able to claim fees if not revenue controller", async () => {
    // initiate sale
    await originationPool.initiateSale();
    await originationPool.purchase(ethers.utils.parseEther("1"));
    await advanceTime(86401);
    await originationPool.claimPurchaseToken();
    const feeAmountEth = await ethers.provider.getBalance(originationCore.address);
    const feeAmountToken = await purchaseToken.balanceOf(originationCore.address);
    expect(feeAmountToken).to.not.equal(0);

    await expect(originationCore.connect(user1).claimFees("0x0000000000000000000000000000000000000000")).
      to.be.revertedWith('Only callable by revenue controller');
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

  it("should fail to create a fungible listing sale with incorrect listing fee", async () => {
    const listingFee = await originationCore.listingFee();
    await expect(
      originationCore.createFungibleListing(
        {
          offerToken: offerToken.address,
          purchaseToken: purchaseToken.address,
          publicStartingPrice: 0, // starting price
          publicEndingPrice: 0, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 200000,
          whitelistSaleDuration: 0,
          totalOfferingAmount: 0,
          reserveAmount: 0,
          vestingPeriod: 0,
          cliffPeriod: 0,
        },
        { value: listingFee.sub(1) }
      )
    ).to.be.revertedWith("Incorrect listing fee");
  });

  it("should fail to create a fungible listing sale with offer token equal to purchase token", async () => {
    const listingFee = await originationCore.listingFee();
    await expect(
      originationCore.createFungibleListing(
        {
          offerToken: offerToken.address,
          purchaseToken: offerToken.address,
          publicStartingPrice: 0, // starting price
          publicEndingPrice: 0, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 200000,
          whitelistSaleDuration: 0,
          totalOfferingAmount: 0,
          reserveAmount: 0,
          vestingPeriod: 0,
          cliffPeriod: 0,
        },
        { value: listingFee }
      )
    ).to.be.revertedWith("Invalid offering");
  });

  it("should fail to create a fungible listing sale with vesting period < cliff period", async () => {
    const listingFee = await originationCore.listingFee();
    await expect(
      originationCore.createFungibleListing(
        {
          offerToken: offerToken.address,
          purchaseToken: purchaseToken.address,
          publicStartingPrice: 0, // starting price
          publicEndingPrice: 0, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 200000,
          whitelistSaleDuration: 0,
          totalOfferingAmount: 0,
          reserveAmount: 0,
          vestingPeriod: 259200,
          cliffPeriod: 320000,
        },
        { value: listingFee }
      )
    ).to.be.revertedWith("Invalid vesting terms");
  });

  it("should fail to create a fungible listing sale duration greater than 4 weeks", async () => {
    const listingFee = await originationCore.listingFee();
    await expect(
      originationCore.createFungibleListing(
        {
          offerToken: offerToken.address,
          purchaseToken: purchaseToken.address,
          publicStartingPrice: 0, // starting price
          publicEndingPrice: 0, // ending price
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

  it("should fail to create a fungible listing sale duration greater than 4 weeks", async () => {
    const listingFee = await originationCore.listingFee();
    await expect(
      originationCore.createFungibleListing(
        {
          offerToken: offerToken.address,
          purchaseToken: purchaseToken.address,
          publicStartingPrice: 0, // starting price
          publicEndingPrice: 0, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 200000, // 
          whitelistSaleDuration: 3024000, // duration greater than 4 weeks
          totalOfferingAmount: 0,
          reserveAmount: 0,
          vestingPeriod: 0,
          cliffPeriod: 0,
        },
        { value: listingFee }
      )
    ).to.be.revertedWith("Invalid whitelist sale duration");
  });

  it("should fail to create a non fungible listing with incorrect listing fee", async () => {
    const listingFee = await originationCore.listingFee();
    // deploy nft
    const listedNft = await deployArgs('MockNFTIntegration', originationCore.address, 'TestNFT', 'tNFT');

    await expect(
      originationCore.createNonFungibleListing(
        {
          collection: listedNft.address,
          maxTotalMintable: 0,
          maxWhitelistMintable: 0,
          maxMintablePerWhitelistedAddress: 0,
          purchaseToken: purchaseToken.address,
          publicStartingPrice: 1, // starting price
          publicEndingPrice: 1, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 3024000, // duration of 1 week
          whitelistSaleDuration: 0, // duration of 0
        },
        { value: listingFee.sub(1) }
      )
    ).to.be.revertedWith("Incorrect listing fee");
  });

  it("should fail to create a non fungible listing with total whitelist mintable > total mintable", async () => {
    const listingFee = await originationCore.listingFee();
    // deploy nft
    const listedNft = await deployArgs('MockNFTIntegration', originationCore.address, 'TestNFT', 'tNFT');

    let whitelistMintable = 500;
    let totalMintable = 300;

    await expect(
      originationCore.createNonFungibleListing(
        {
          collection: listedNft.address,
          maxTotalMintable: totalMintable,
          maxWhitelistMintable: whitelistMintable,
          maxMintablePerWhitelistedAddress: 0,
          purchaseToken: purchaseToken.address,
          publicStartingPrice: 1, // starting price
          publicEndingPrice: 1, // ending price
          whitelistStartingPrice: 0,
          whitelistEndingPrice: 0,
          publicSaleDuration: 3024000, // duration of 1 week
          whitelistSaleDuration: 0, // duration of 0
        },
        { value: listingFee }
      )
    ).to.be.revertedWith("Invalid whitelist mintable amount");
  });

  it("shouldn't be able to initialize origination core with > 1e18 fee", async () => {
    const originationCoreImpl = await deploy('OriginationCore');

    const originationCoreProxy = await deployArgs('OriginationCoreProxy', originationCoreImpl.address, user.address);
    const originationCore = await ethers.getContractAt('OriginationCore', originationCoreProxy.address);
    await expect(originationCore.initialize(1, bnDecimal(1).add(1), ethers.constants.AddressZero, 
      ethers.constants.AddressZero, ethers.constants.AddressZero, ethers.constants.AddressZero)).
      to.be.revertedWith('Invalid origination fee');
  })
});
