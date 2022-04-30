const { ethers, deployments } = require("hardhat");
const { deployArgs, deploy, bnDecimal } = require("../scripts/helpers");

const createFixture = deployments.createFixture(async () => {
  // get signers
  const accounts = await ethers.getSigners();
  const [deployer, user, user1] = accounts;

  // set up purchase token and offer token
  const purchaseToken = await deployArgs("MockERC20", "Purchase", "PRCH", 18);
  const offerToken = await deployArgs("MockERC20", "Offer", "OFFR", 10);

  // token transfers
  await purchaseToken.transfer(user.address, ethers.utils.parseEther("1000000"));
  await purchaseToken.transfer(user1.address, ethers.utils.parseEther("1000000"));

  // deploy fungible origination pool implementation
  const originationPoolImpl = await deploy('FungibleOriginationPool')
  // deploy non-fungible origination pool implementation
  const nonFungibleOriginationPoolImpl = await deploy('NonFungibleOriginationPool');
  // deploy vesting entry nft implementation
  const vestingEntryNFTImpl = await deploy('VestingEntryNFT');

  // deploy the test upgrade contract
  const originationPoolUpgrade = await deploy('OriginationPoolUpgrade');
  // deploy the test upgrade contract
  const nonFungibleOriginationPoolUpgrade = await deploy('NonFungiblePoolUpgrade');

  const xTokenManager = await deploy('MockxTokenManager');
  // set deployer as the revenue controller
  await xTokenManager.setRevenueController(deployer.address);

  // Deploy origination proxy admin
  const proxyAdmin = await deploy('OriginationProxyAdmin');

  // deploy pool deployer
  const poolDeployer = await deployArgs('PoolDeployer', originationPoolImpl.address, nonFungibleOriginationPoolImpl.address);

  // deploy vesting entry nft deployer
  const nftDeployer = await deployArgs('NFTDeployer', vestingEntryNFTImpl.address)

  // deploy origination core
  const listingFee = ethers.utils.parseEther("0.01"); // 1 %
  const originationFee = ethers.utils.parseEther("0.01");
  const originationCoreImpl = await deploy('OriginationCore');

  const originationCoreProxy = await deployArgs('OriginationCoreProxy', originationCoreImpl.address, user.address);
  const originationCore = await ethers.getContractAt('OriginationCore', originationCoreProxy.address);
  await originationCore.initialize(listingFee, originationFee, xTokenManager.address, 
      poolDeployer.address, nftDeployer.address, proxyAdmin.address);
  await proxyAdmin.transferOwnership(originationCore.address);
  

  // --- Deploy fungible origination pool ---

  // token sale parameters
  const offerPricePerPurchaseToken = bnDecimal(10); // selling at 10 purchase tokens
  const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m
  const saleThreshold = ethers.utils.parseEther("1");
  const vestingPeriod = 0; // no vesting period
  const cliffPeriod = 0; // no cliff period

  // ***deploy test case where purchase token is not ETH
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: 0,
      whitelistEndingPrice: 0,
      publicSaleDuration: 86400, // duration of 24 hours
      whitelistSaleDuration: 0, // duration of 0
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  let receipt = await tx.wait();
  let eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  let originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPool = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);

  // token approvals
  await purchaseToken.approve(originationPool.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPool.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPool.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPool.address, ethers.utils.parseUnits("1000000", 10));

  // token sale parameters
  const tokenMintPrice = bnDecimal(10) ; // selling at 10 purchase tokens
  const maxTotalMintable = 1000;
  const maxWhitelistMintable = 20;
  const maxMintablePerWhitelistedAddress = 10;

  // --- Deploy non fungible origination pool ---

  // deploy nft
  const listedNft = await deployArgs('MockNFTIntegration', originationCore.address, 'TestNFT', 'tNFT');

  // Create listing without whitelist, duration of 1 week
  // ERC-20 token used to mint nfts
  tx = await originationCore.createNonFungibleListing(
    {
      collection: listedNft.address,
      maxTotalMintable: maxTotalMintable,
      maxWhitelistMintable: maxWhitelistMintable,
      maxMintablePerWhitelistedAddress: maxMintablePerWhitelistedAddress,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: tokenMintPrice, // starting price
      publicEndingPrice: tokenMintPrice, // ending price
      whitelistStartingPrice: 0,
      whitelistEndingPrice: 0,
      publicSaleDuration: 604800, // duration of 1 week
      whitelistSaleDuration: 0, // duration of 0
    },
    { value: listingFee }
  );

  // get the pool address from listing event
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateNonFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const nonFungibleOriginationPool = await ethers.getContractAt("NonFungibleOriginationPool", originationPoolAddress);

  // token approvals
  await purchaseToken.approve(nonFungibleOriginationPool.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(nonFungibleOriginationPool.address, ethers.utils.parseEther("10000000000"));


  return {
    accounts,
    originationCore,
    purchaseToken,
    offerToken,
    originationPoolUpgrade,
    nonFungibleOriginationPoolUpgrade,
    nonFungibleOriginationPool,
    originationPool
  };
});

module.exports = createFixture;
