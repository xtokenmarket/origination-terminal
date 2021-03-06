const { ethers, deployments } = require("hardhat");
const { deployArgs, deploy, getMerkleTree, getMerkleProofs, getMerkleWhitelist } = require("../../scripts/helpers");

const createFixture = deployments.createFixture(async () => {
  // get signers
  const accounts = await ethers.getSigners();
  const [deployer, user, user1] = accounts;

  // set up purchase token and offer token
  const purchaseToken = await deployArgs("MockERC20", "Purchase", "PRCH", 18);
  const offerToken = await deployArgs("MockERC20", "Offer", "OFFR", 10);
  const purchaseTokenDecimalsLower = await deployArgs("MockERC20", "Purchase", "PRCH", 6);

  // merkle tree for whitelisting
  const merkleTree = await getMerkleTree();
  const rootHash = merkleTree.getHexRoot();
  const [deployerProof, userProof] = await getMerkleProofs();
  const whitelist = await getMerkleWhitelist();

  // token transfers
  await purchaseToken.transfer(user.address, ethers.utils.parseEther("1000000"));
  await purchaseTokenDecimalsLower.transfer(user.address, ethers.utils.parseUnits("1000000", 6));
  await purchaseToken.transfer(user1.address, ethers.utils.parseEther("1000000"));
  await purchaseTokenDecimalsLower.transfer(user1.address, ethers.utils.parseUnits("1000000", 6));

  // deploy fungible origination pool implementation
  const originationPoolImpl = await deploy("FungibleOriginationPool");
  // deploy non-fungible origination pool implementation
  const nonFungibleOriginationPoolImpl = await deploy("NonFungibleOriginationPool");
  // deploy vesting entry nft implementation
  const vestingEntryNFTImpl = await deploy("VestingEntryNFT");

  // deploy the test upgrade contract
  const originationPoolUpgrade = await deploy("OriginationPoolUpgrade");
  // deploy the test upgrade contract
  const nonFungibleOriginationPoolUpgrade = await deploy("NonFungiblePoolUpgrade");

  const xTokenManager = await deploy("MockxTokenManager");
  // set deployer as the revenue controller
  await xTokenManager.setRevenueController(deployer.address);

  // Deploy origination proxy admin
  const proxyAdmin = await deploy("OriginationProxyAdmin");

  // deploy pool deployer
  const poolDeployer = await deployArgs("PoolDeployer", originationPoolImpl.address, nonFungibleOriginationPoolImpl.address);

  // deploy vesting entry nft deployer
  const nftDeployer = await deployArgs("NFTDeployer", vestingEntryNFTImpl.address);

  // deploy origination core
  const listingFee = ethers.utils.parseEther("0.01"); // 1 %
  const originationFee = ethers.utils.parseEther("0.01");
  const originationCoreImpl = await deploy("OriginationCore");

  const originationCoreProxy = await deployArgs("OriginationCoreProxy", originationCoreImpl.address, user.address);
  const originationCore = await ethers.getContractAt("OriginationCore", originationCoreProxy.address);
  await originationCore.initialize(listingFee, originationFee, xTokenManager.address, poolDeployer.address, nftDeployer.address, proxyAdmin.address);
  await proxyAdmin.transferOwnership(originationCore.address);

  // token sale parameters
  const offerPricePerPurchaseToken = ethers.utils.parseEther("0.1"); // selling at 0.1 ETH
  const whitelistOfferPricePerPurchaseToken = ethers.utils.parseEther("0.05"); // selling at 0.05 ETH for whitelisted
  const totalOfferingAmount = ethers.utils.parseUnits("1000000", 10); // selling a total of 1m
  const saleThreshold = ethers.utils.parseEther("1");
  const vestingPeriod = 0; // no vesting period
  const cliffPeriod = 0; // no cliff period
  const whitelistStartingPrice = 0;
  const whitelistEndingPrice = 0;
  const publicSaleDuration = 86400; // duration of 24 hours
  const whitelistSaleDuration = 0; // duration of 24 hours

  // ***deploy test case where purchase token are not ETH
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
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
  await originationPool.setWhitelist(rootHash);

  // token approvals
  await purchaseToken.approve(originationPool.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPool.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPool.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPool.address, ethers.utils.parseUnits("1000000", 10));

  // ***deploy test case where purchase token is ETH
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: ethers.constants.AddressZero,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolETH = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolETH.setWhitelist(rootHash);

  // token approvals
  await offerToken.approve(originationPoolETH.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolETH.address, ethers.utils.parseUnits("1000000", 10));

  let lowerDecimalsPurchasePrice = ethers.utils.parseUnits("0.1", 6);

  // ***deploy test case where purchase token decimals are less than offer token decimals
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseTokenDecimalsLower.address,
      publicStartingPrice: lowerDecimalsPurchasePrice, // starting price
      publicEndingPrice: lowerDecimalsPurchasePrice, // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
      totalOfferingAmount: ethers.utils.parseUnits("1000000", 10),
      reserveAmount: ethers.utils.parseUnits("1", 6),
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolDecimals = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolDecimals.setWhitelist(rootHash);

  // token approvals
  await purchaseTokenDecimalsLower.approve(originationPoolDecimals.address, ethers.utils.parseEther("10000000000"));
  await purchaseTokenDecimalsLower.connect(user).approve(originationPoolDecimals.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPoolDecimals.address, ethers.utils.parseEther("1000000"));
  await offerToken.connect(user).approve(originationPoolDecimals.address, ethers.utils.parseEther("1000000"));

  // ***deploy test case where sale price is ascending
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken.mul(4), // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolAscending = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolAscending.setWhitelist(rootHash);

  // token approvals
  await purchaseToken.approve(originationPoolAscending.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPoolAscending.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPoolAscending.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolAscending.address, ethers.utils.parseUnits("1000000", 10));

  // ***deploy test case where sale price is descending
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: offerPricePerPurchaseToken.mul(4), // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolDescending = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolDescending.setWhitelist(rootHash);

  // token approvals
  await purchaseToken.approve(originationPoolDescending.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPoolDescending.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPoolDescending.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolDescending.address, ethers.utils.parseUnits("1000000", 10));

  // ***deploy test case where there is a vesting period
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: 259200, // 3 days vesting period
      cliffPeriod: 172800, // 2 days cliff period
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolVesting = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolVesting.setWhitelist(rootHash);

  // token approvals
  await purchaseToken.approve(originationPoolVesting.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPoolVesting.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPoolVesting.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolVesting.address, ethers.utils.parseUnits("1000000", 10));

  // ***deploy test case where there is a vesting period and decimals are different
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseTokenDecimalsLower.address,
      publicStartingPrice: lowerDecimalsPurchasePrice, // starting price
      publicEndingPrice: lowerDecimalsPurchasePrice, // ending price
      whitelistStartingPrice: whitelistStartingPrice,
      whitelistEndingPrice: whitelistEndingPrice,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: whitelistSaleDuration,
      totalOfferingAmount: ethers.utils.parseUnits("1000000", 10),
      reserveAmount: ethers.utils.parseUnits("1", 6),
      vestingPeriod: 259200, // 3 days vesting period
      cliffPeriod: 172800, // 2 days cliff period
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolVestingDecimals = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolVestingDecimals.setWhitelist(rootHash);

  // token approvals
  await purchaseTokenDecimalsLower.approve(originationPoolVestingDecimals.address, ethers.utils.parseEther("10000000000"));
  await purchaseTokenDecimalsLower.connect(user).approve(originationPoolVestingDecimals.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPoolVestingDecimals.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolVestingDecimals.address, ethers.utils.parseUnits("1000000", 10));

  // ***deploy test case where purchase token are not ETH
  // ***and whitelist sale duration is not 0
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: whitelistOfferPricePerPurchaseToken,
      whitelistEndingPrice: whitelistOfferPricePerPurchaseToken,
      publicSaleDuration: publicSaleDuration,
      whitelistSaleDuration: 86400, // duration of 24 hours
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolWhitelist = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolWhitelist.setWhitelist(rootHash);

  // token approvals
  await purchaseToken.approve(originationPoolWhitelist.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPoolWhitelist.address, ethers.utils.parseEther("10000000000"));
  await offerToken.approve(originationPoolWhitelist.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolWhitelist.address, ethers.utils.parseUnits("1000000", 10));

  // ***deploy test case where purchase token is ETH
  // create listing
  tx = await originationCore.createFungibleListing(
    {
      offerToken: offerToken.address,
      purchaseToken: ethers.constants.AddressZero,
      publicStartingPrice: offerPricePerPurchaseToken, // starting price
      publicEndingPrice: offerPricePerPurchaseToken, // ending price
      whitelistStartingPrice: whitelistOfferPricePerPurchaseToken,
      whitelistEndingPrice: whitelistOfferPricePerPurchaseToken,
      publicSaleDuration: 86400, // duration of 24 hours
      whitelistSaleDuration: 86400, // duration of 24 hours
      totalOfferingAmount: totalOfferingAmount,
      reserveAmount: saleThreshold,
      vestingPeriod: vestingPeriod,
      cliffPeriod: cliffPeriod,
    },
    { value: listingFee }
  );

  // listing to event for pool address
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolETHWhitelist = await ethers.getContractAt("FungibleOriginationPool", originationPoolAddress);
  await originationPoolETHWhitelist.setWhitelist(rootHash);

  // token approvals
  await offerToken.approve(originationPoolETHWhitelist.address, ethers.utils.parseUnits("1000000", 10));
  await offerToken.connect(user).approve(originationPoolETHWhitelist.address, ethers.utils.parseUnits("1000000", 10));

  return {
    accounts,
    originationCore,
    purchaseToken,
    purchaseTokenDecimalsLower,
    offerToken,
    originationPoolUpgrade,
    nonFungibleOriginationPoolUpgrade,
    originationPool,
    originationPoolETH,
    originationPoolWhitelist,
    originationPoolETHWhitelist,
    originationPoolDecimals,
    originationPoolAscending,
    originationPoolDescending,
    originationPoolVesting,
    originationPoolVestingDecimals,
    rootHash,
    deployerProof,
    userProof,
    whitelist,
    originationFee,
    poolCreationParams: {
      [originationPool.address]: {
        offerToken: offerToken.address,
        purchaseToken: ethers.constants.AddressZero,
        publicStartingPrice: offerPricePerPurchaseToken, // starting price
        publicEndingPrice: offerPricePerPurchaseToken, // ending price
        whitelistStartingPrice: whitelistStartingPrice,
        whitelistEndingPrice: whitelistEndingPrice,
        publicSaleDuration: publicSaleDuration,
        whitelistSaleDuration: whitelistSaleDuration,
        totalOfferingAmount: totalOfferingAmount,
        reserveAmount: saleThreshold,
        vestingPeriod: vestingPeriod,
        cliffPeriod: cliffPeriod,
      },
    },
  };
});

module.exports = createFixture;
