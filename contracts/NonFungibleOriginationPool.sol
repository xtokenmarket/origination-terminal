// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "./interface/INonFungibleOriginationPool.sol";
import "./interface/INonFungibleToken.sol";

contract NonFungibleOriginationPool is
    INonFungibleOriginationPool,
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    //--------------------------------------------------------------------------
    // Constants
    //--------------------------------------------------------------------------
    uint256 constant TIME_PRECISION = 1e10;

    // address with manager capabilities
    address public manager;
    // the fee owed to the origination core when purchasing tokens (ex: 1e16 = 1% fee)
    uint256 public originationFee;
    // the origination core contract
    IOriginationCore private originationCore;
    // the erc-721 compatible nft being sold
    INonFungibleToken public nft;
    // max total mintable supply
    uint256 public maxTotalMintable;
    // max mintable nfts per address
    uint256 public maxMintablePerAddress;
    // max mintable nfts per whitelisted address
    uint256 public maxWhitelistMintable;
    // the sale starting price (in purchase token)
    uint256 public startingPrice;
    // the sale ending price (in purchase token)
    uint256 public endingPrice;
    // the sale starting price for whitelisted addresses (in purchase token)
    uint256 public whitelistStartingPrice;
    // the sale ending price for whitelisted addresses (in purchase token)
    uint256 public whitelistEndingPrice;
    // whitelist sale duration
    uint256 public whitelistSaleDuration;
    // public sale duration
    uint256 public publicSaleDuration;
    // total sale duration (in seconds)
    uint256 public saleDuration;
    // the whitelist data
    Whitelist public whitelist;

    // true if sale has started, false otherwise
    bool public saleInitiated;
    // the timestamp of the beginning of the sale
    uint256 public saleInitiatedTimestamp;
    // the timestamp of the end of the sale
    uint256 public saleEndTimestamp;

    mapping(address => uint256) userMints;

    // total mint count
    uint256 public totalMints;
    // whitelist mint count
    uint256 public whitelistMints;

    //--------------------------------------------------------------------------
    // Events
    //--------------------------------------------------------------------------

    event InitiateSale(uint256 saleInitiatedTimestamp);

    //--------------------------------------------------------------------------
    // Modifiers
    //--------------------------------------------------------------------------

    modifier onlyOwnerOrManager() {
        require(isOwnerOrManager(msg.sender), "Not owner or manager");
        _;
    }

    //--------------------------------------------------------------------------
    // Constructor / Initializer
    //--------------------------------------------------------------------------

    // Initialize the implementation
    constructor() initializer {}

    function initialize(
        uint256 _originationFee,
        IOriginationCore _originationCore,
        address _admin,
        SaleParams calldata _saleParams
    ) external override initializer {
        __Ownable_init();
        __ReentrancyGuard_init_unchained();

        originationFee = _originationFee;
        originationCore = _originationCore;

        nft = INonFungibleToken(_saleParams.collection);

        maxTotalMintable = _saleParams.maxTotalMintable;
        maxMintablePerAddress = _saleParams.maxMintablePerAddress;
        maxWhitelistMintable = _saleParams.maxWhitelistMintable;

        startingPrice = _saleParams.startingPrice;
        endingPrice = _saleParams.endingPrice;
        whitelistStartingPrice = _saleParams.whitelistStartingPrice;
        whitelistEndingPrice = _saleParams.whitelistEndingPrice;

        whitelistSaleDuration = _saleParams.whitelistSaleDuration;
        publicSaleDuration = _saleParams.publicSaleDuration;

        _transferOwnership(_admin);
    }

    //--------------------------------------------------------------------------
    // Investor Functions
    //--------------------------------------------------------------------------

    /**
     * @dev Purchases the offer token with a contribution amount of purchase tokens
     * @dev If purchasing with ETH, contribution amount must equal ETH sent
     *
     * @param _quantityToMint Number of NFTs to mint
     * @param _merkleProof The merkle proof associated with msg.sender to prove whitelisted
     */
    function whitelistMint(uint256 _quantityToMint, bytes32[] calldata _merkleProof) external payable {
        require(isWhitelistMintPeriod(), "Not whitelist period");

        address sender = msg.sender;
        bytes32 leaf = keccak256(abi.encodePacked(sender));
        require(MerkleProof.verify(_merkleProof, whitelist.whitelistMerkleRoot, leaf), "Address not whitelisted");

        require(whitelistMints + _quantityToMint <= maxWhitelistMintable, "Exceeds whitelist supply");
        whitelistMints += _quantityToMint;

        _mint(_quantityToMint, sender);
    }

    function publicMint(uint256 _quantityToMint) external payable {
        require(isPublicMintPeriod(), "Not public mint period");

        _mint(_quantityToMint, msg.sender);
    }

    // TODO: make compatible with erc20 payment too
    function _mint(uint256 _quantityToMint, address _minter) private nonReentrant {
        require(saleInitiated, "Sale not initiated");

        require(userMints[_minter] + _quantityToMint <= maxMintablePerAddress, "User mint cap reached");
        userMints[_minter] += _quantityToMint;

        require(totalMints + _quantityToMint <= maxTotalMintable, "Total mint cap reached");
        totalMints += _quantityToMint;

        // calc price, return some eth if necessary
        // (in the case of ascending price auction, FE should send a little bit too much ETH to ensure tx succeeds)
        // problem above will not be an issue with erc20 payment
        uint256 currentMintPrice = getCurrentMintPrice();
        uint256 ethOwable = _quantityToMint * currentMintPrice;
        require(msg.value >= ethOwable, "Insufficient payment");

        uint256 amountToReturn = msg.value - ethOwable;
        if (amountToReturn > 0) {
            (bool success, ) = payable(_minter).call{ value: amountToReturn }("");
            require(success);
        }

        nft.mintTo(_minter, _quantityToMint);
    }

    //--------------------------------------------------------------------------
    // Admin Functions
    //--------------------------------------------------------------------------

    /**
     * @dev Admin function to set a whitelist
     *
     * @param _whitelist The whitelist
     */
    function setWhitelist(Whitelist calldata _whitelist) external onlyOwnerOrManager {
        require(!saleInitiated, "Cannot set whitelist after sale initiated");

        whitelist = _whitelist;
    }

    /**
     * @dev Admin function used to initiate the sale
     * @dev Function will transfer the total offer tokens from admin to contract
     */
    function initiateSale() external onlyOwnerOrManager {
        require(!saleInitiated, "Sale already initiated");

        saleInitiated = true;
        saleInitiatedTimestamp = block.timestamp;
        saleEndTimestamp = saleInitiatedTimestamp + saleDuration;

        emit InitiateSale(saleInitiatedTimestamp);
    }

    //--------------------------------------------------------------------------
    // View Functions
    //--------------------------------------------------------------------------

    function getCurrentMintPrice() public view returns (uint256 mintPrice) {
        require(isWhitelistMintPeriod() || isPublicMintPeriod(), "Inactive sale");
        uint256 timeElapsed = block.timestamp - saleInitiatedTimestamp;

        uint256 periodStartingPrice = isWhitelistMintPeriod() ? whitelistStartingPrice : startingPrice;
        uint256 periodEndingPrice = isWhitelistMintPeriod() ? whitelistEndingPrice : endingPrice;

        uint256 saleRange = periodStartingPrice < periodEndingPrice
            ? periodEndingPrice - periodStartingPrice
            : periodStartingPrice - periodEndingPrice;
        uint256 saleCompletionRatio = (saleDuration * TIME_PRECISION) / timeElapsed;
        uint256 saleDelta = (saleRange * TIME_PRECISION) / saleCompletionRatio;

        mintPrice = periodStartingPrice < periodEndingPrice ?
            periodStartingPrice + saleDelta :
            periodStartingPrice - saleDelta;
    }

    function isWhitelistMintPeriod() public view returns (bool) {
        return
            block.timestamp > saleInitiatedTimestamp &&
            block.timestamp <= (saleInitiatedTimestamp + whitelistSaleDuration);
    }

    function isPublicMintPeriod() public view returns (bool) {
        uint256 endOfWhitelistPeriod = saleInitiatedTimestamp + whitelistSaleDuration;
        return block.timestamp > endOfWhitelistPeriod && block.timestamp <= (endOfWhitelistPeriod + publicSaleDuration);
    }

    /**
     * @dev Checks to see if address is an admin (owner or manager)
     *
     * @param _address The address of verify
     * @return True if owner of manager, false otherwise
     */
    function isOwnerOrManager(address _address) public view returns (bool) {
        return _address == owner() || _address == manager;
    }
}
