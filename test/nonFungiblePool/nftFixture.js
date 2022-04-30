const { ethers, deployments } = require("hardhat");
const { deployArgs, deploy, getMerkleTreeNonFungible, getMerkleProofsNonFungible, 
        getMerkleWhitelistNonFungible, bnDecimal } = require("../../scripts/helpers");

const createFixture = deployments.createFixture(async () => {
  // get signers
  const accounts = await ethers.getSigners();
  const [deployer, user, user1, user2, user3] = accounts;

  // set up purchase token and offer token
  const purchaseToken = await deployArgs("MockERC20", "Purchase", "PRCH", 18);

  // merkle tree for whitelisting
  const merkleTree = await getMerkleTreeNonFungible();
  const whitelistRoot = merkleTree.getHexRoot();
  const [deployerProof, userProof, user1Proof] = await getMerkleProofsNonFungible();
  const whitelist = await getMerkleWhitelistNonFungible();

  // token transfers
  await purchaseToken.transfer(user.address, ethers.utils.parseEther("1000000"));
  await purchaseToken.transfer(user1.address, ethers.utils.parseEther("1000000"));
  await purchaseToken.transfer(user2.address, ethers.utils.parseEther("1000000"));
  await purchaseToken.transfer(user3.address, ethers.utils.parseEther("1000000"));

  // deploy fungible origination pool implementation
  const originationPoolImpl = await deploy('FungibleOriginationPool')
  // deploy non-fungible origination pool implementation
  const nonFungibleOriginationPoolImpl = await deploy('NonFungibleOriginationPool');
  // deploy vesting entry nft implementation
  const vestingEntryNFTImpl = await deploy('VestingEntryNFT');

  // deploy the test upgrade contract
  const originationPoolUpgrade = await deploy('OriginationPoolUpgrade');

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

  // token sale parameters
  const tokenMintPrice = bnDecimal(10) ; // selling at 10 purchase tokens
  const maxTotalMintable = 1000;
  const maxWhitelistMintable = 20;
  const maxMintablePerWhitelistedAddress = 10;

  // ---- Pool Deployment 1 ----

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
  let receipt = await tx.wait();
  let eventListing = await receipt.events.find((e) => e.event === "CreateNonFungibleListing");
  let originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPool = await ethers.getContractAt("NonFungibleOriginationPool", originationPoolAddress);

  // token approvals
  await purchaseToken.approve(originationPool.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPool.address, ethers.utils.parseEther("10000000000"));

  // ---- Pool Deployment 2 ----

  const ethMintPrice = ethers.utils.parseEther('0.05')

  // deploy nft
  const listedNftETHPool = await deployArgs('MockNFTIntegration', originationCore.address, 'TestNFT', 'tNFT');

  // Create listing without whitelist, duration of 1 week
  // ETH used to mint nfts
  tx = await originationCore.createNonFungibleListing(
    {
      collection: listedNftETHPool.address,
      maxTotalMintable: maxTotalMintable,
      maxWhitelistMintable: maxWhitelistMintable,
      maxMintablePerWhitelistedAddress: maxMintablePerWhitelistedAddress,
      purchaseToken: ethers.constants.AddressZero,
      publicStartingPrice: ethMintPrice, // starting price
      publicEndingPrice: ethMintPrice, // ending price
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
  const originationPoolETH = await ethers.getContractAt("NonFungibleOriginationPool", originationPoolAddress);
  
  // ---- Pool Deployment 3 ----

  const whitelistMintPrice = bnDecimal(5);

  // deploy nft
  const listedNftWhitelist = await deployArgs('MockNFTIntegration', originationCore.address, 'TestNFT', 'tNFT');

  // Create listing with whitelist with 3 day duration 
  // main sale duration of 1 week
  // ERC-20 token used to mint nfts
  tx = await originationCore.createNonFungibleListing(
    {
      collection: listedNftWhitelist.address,
      maxTotalMintable: maxTotalMintable,
      maxWhitelistMintable: maxWhitelistMintable,
      maxMintablePerWhitelistedAddress: maxMintablePerWhitelistedAddress,
      purchaseToken: purchaseToken.address,
      publicStartingPrice: tokenMintPrice, // starting price
      publicEndingPrice: tokenMintPrice, // ending price
      whitelistStartingPrice: whitelistMintPrice,
      whitelistEndingPrice: whitelistMintPrice,
      publicSaleDuration: 604800, // duration of 1 week
      whitelistSaleDuration: 259200, // duration of 3 days
    },
    { value: listingFee }
  );

  // get the pool address from listing event
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateNonFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolWhitelist = await ethers.getContractAt("NonFungibleOriginationPool", originationPoolAddress);

  // token approvals
  await purchaseToken.approve(originationPoolWhitelist.address, ethers.utils.parseEther("10000000000"));
  await purchaseToken.connect(user).approve(originationPoolWhitelist.address, ethers.utils.parseEther("10000000000"));

  // Set whitelist root
  await originationPoolWhitelist.setWhitelist(whitelistRoot);

  // ---- Pool Deployment 4 ----

  const ethMintPriceWhitelist = ethers.utils.parseEther('0.03');

  // deploy nft
  const listedNftETHPoolWhitelist = await deployArgs('MockNFTIntegration', originationCore.address, 'TestNFT', 'tNFT');

  // Create listing with whitelist, duration of 1 week
  // ETH used to mint nfts
  tx = await originationCore.createNonFungibleListing(
    {
      collection: listedNftETHPoolWhitelist.address,
      maxTotalMintable: maxTotalMintable,
      maxWhitelistMintable: maxWhitelistMintable,
      maxMintablePerWhitelistedAddress: maxMintablePerWhitelistedAddress,
      purchaseToken: ethers.constants.AddressZero,
      publicStartingPrice: ethMintPrice, // starting price
      publicEndingPrice: ethMintPrice, // ending price
      whitelistStartingPrice: ethMintPriceWhitelist,
      whitelistEndingPrice: ethMintPriceWhitelist,
      publicSaleDuration: 604800, // duration of 1 week
      whitelistSaleDuration: 259200, // duration of 0
    },
    { value: listingFee }
  );

  // get the pool address from listing event
  receipt = await tx.wait();
  eventListing = await receipt.events.find((e) => e.event === "CreateNonFungibleListing");
  originationPoolAddress = eventListing.args[0];

  // get origination pool contract
  const originationPoolETHWhitelist = await ethers.getContractAt("NonFungibleOriginationPool", originationPoolAddress);
  // Set whitelist root
  await originationPoolETHWhitelist.setWhitelist(whitelistRoot);

  return {
    accounts,
    originationCore,
    purchaseToken,
    originationPoolUpgrade,
    originationPool,
    originationPoolETH,
    originationPoolWhitelist,
    originationPoolETHWhitelist,
    listedNft,
    listedNftETHPool,
    listedNftETHPoolWhitelist,
    listedNftWhitelist,
    tokenMintPrice,
    whitelistMintPrice,
    ethMintPrice,
    ethMintPriceWhitelist,
    whitelistRoot,
    deployerProof,
    userProof,
    user1Proof,
    whitelist
  };
});

module.exports = createFixture;
