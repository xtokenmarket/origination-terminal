//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "./interface/IFungibleOriginationPool.sol";
import "./interface/IVestingEntryNFT.sol";

import "./VestingEntryNFT.sol";

/**
 * Origination pool representing a fungible token sale
 * Users buy an ERC-20 token using ETH or other ERC-20 token
 * If the set reserve amount is reached, token sale can be finalized and
 * Users can claim their offer tokens
 */
contract FungibleOriginationPool is
    IFungibleOriginationPool,
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20Metadata;

    //--------------------------------------------------------------------------
    // Constants
    //--------------------------------------------------------------------------

    uint256 constant TIME_PRECISION = 1e10;
    uint256 constant MAX_SALE_DURATION = 4 weeks;

    //--------------------------------------------------------------------------
    // State variables
    //--------------------------------------------------------------------------

    // the token being offered for sale
    IERC20Metadata public offerToken;
    // the token used to purchase the offered token
    IERC20Metadata public purchaseToken;
    // the amount of offer token decimals
    uint256 private offerTokenDecimals;
    // the amount of purchase token decimals
    uint256 private purchaseTokenDecimals;

    // Token sale params
    // the public sale starting price (in purchase token)
    uint256 public publicStartingPrice;
    // the public sale ending price (in purchase token)
    uint256 public publicEndingPrice;
    // the whitelist sale starting price (in purchase token)
    uint256 public whitelistStartingPrice;
    // the whitelist sale ending price (in purchase token)
    uint256 public whitelistEndingPrice;
    // the public sale duration (in seconds)
    uint256 public publicSaleDuration;
    // whitelist sale duration (in seconds)
    uint256 public whitelistSaleDuration;
    // the total sale duration
    uint256 public saleDuration;
    // the total amount of offer tokens for sale
    uint256 public totalOfferingAmount;
    // need to raise this amount of purchase tokens for sale completion
    uint256 public reserveAmount;
    // the vesting period (can be 0)
    uint256 public vestingPeriod;
    // the vesting cliff period (must be <= vesting period)
    uint256 public cliffPeriod;
    // the whitelist merkle root - used to verify whitelist proofs
    bytes32 public whitelistMerkleRoot;

    // the fee owed to the origination core when purchasing tokens (ex: 1e16 = 1% fee)
    uint256 public originationFee;
    // the origination core contract
    IOriginationCore public originationCore;
    // the nft representing vesting entries for users
    VestingEntryNFT public vestingEntryNFT;

    // address with manager capabilities
    address public manager;

    // true if sale has started, false otherwise
    bool public saleInitiated;
    // the timestamp of the beginning of the sale
    uint256 public saleInitiatedTimestamp;
    // the timestamp of the end of the sale
    // sale can end if all offer tokens are purchased
    uint256 public saleEndTimestamp;

    // the amount of offer tokens which are reserved for vesting
    uint256 public vestableTokenAmount;
    // id to keep track of vesting positions
    uint256 public vestingID;

    // Sale trackers
    // address to vesting entry nft id tracker (not accurate if nft is transferred)
    // only used for internal tracking of the vestings
    mapping(address => uint256) public userToVestingId;
    // purchaser address to amount purchased
    mapping(address => uint256) public offerTokenAmountPurchased;
    // purchaser address to amount contributed
    mapping(address => uint256) public purchaseTokenContribution;
    // the total amount of offer tokens sold
    uint256 public offerTokenAmountSold;
    // the total amount of purchase tokens acquired
    uint256 public purchaseTokensAcquired;
    // the total amount of origination fees
    uint256 public originationCoreFees;
    // true if the sponsor has claimed purchase tokens / remaining offer tokens at conclusion of sale, false otherwise
    bool public sponsorTokensClaimed;

    //--------------------------------------------------------------------------
    // Events
    //--------------------------------------------------------------------------

    event InitiateSale(uint256 totalOfferingAmount);
    event PurchaseTokenClaim(address indexed owner, uint256 amountClaimed);
    event Purchase(
        address indexed purchaser,
        uint256 contributionAmount,
        uint256 offerAmount,
        uint256 purchaseFee
    );
    event CreateVestingEntry(
        address indexed purchaser,
        uint256 vestingId,
        uint256 offerTokenAmount
    );
    event ClaimVested(
        address indexed purchaser,
        uint256 tokenAmountClaimed,
        uint256 tokenAmountRemaining
    );

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

    /**
     * @dev Initializes the origination pool contract
     *
     * @param _originationFee The fee owed to the origination core when purchasing tokens. E.g. 1e16 = 1% fee
     * @param _originationCore The origination core contract
     * @param _admin The admin/owner of the pool
     * @param _saleParams The sale params
     */
    function initialize(
        uint256 _originationFee,
        IOriginationCore _originationCore,
        address _admin,
        address _vestingEntryNFT,
        SaleParams calldata _saleParams
    ) external override initializer {
        __Ownable_init();
        __ReentrancyGuard_init_unchained();

        offerToken = IERC20Metadata(_saleParams.offerToken);
        purchaseToken = IERC20Metadata(_saleParams.purchaseToken);
        offerTokenDecimals = 10**offerToken.decimals();
        purchaseTokenDecimals = _saleParams.purchaseToken == address(0)
            ? 10**18
            : 10**purchaseToken.decimals();

        publicStartingPrice = _saleParams.publicStartingPrice;
        publicEndingPrice = _saleParams.publicEndingPrice;
        whitelistStartingPrice = _saleParams.whitelistStartingPrice;
        whitelistEndingPrice = _saleParams.whitelistEndingPrice;

        require(
            _saleParams.publicSaleDuration <= MAX_SALE_DURATION,
            "Invalid sale duration"
        );
        require(
            _saleParams.whitelistSaleDuration <= MAX_SALE_DURATION,
            "Invalid whitelist sale duration"
        );
        publicSaleDuration = _saleParams.publicSaleDuration;
        whitelistSaleDuration = _saleParams.whitelistSaleDuration;
        saleDuration = whitelistSaleDuration + publicSaleDuration;

        totalOfferingAmount = _saleParams.totalOfferingAmount;
        reserveAmount = _saleParams.reserveAmount;
        vestingPeriod = _saleParams.vestingPeriod;
        cliffPeriod = _saleParams.cliffPeriod;
        originationFee = _originationFee;
        originationCore = _originationCore;

        if (_vestingEntryNFT != address(0)) {
            vestingEntryNFT = VestingEntryNFT(_vestingEntryNFT);
            vestingEntryNFT.initialize("VestingNFT", "VNFT", address(this));
        }

        _transferOwnership(_admin);
    }

    //--------------------------------------------------------------------------
    // Investor Functions
    //--------------------------------------------------------------------------

    /**
     * @dev Whitelist purchase function
     * @dev Purchases the offer token with a contribution amount of purchase tokens
     * @dev If purchasing with ETH, contribution amount must equal ETH sent
     *
     * @param merkleProof The merkle proof associated with msg.sender to prove whitelisted
     * @param contributionAmount The contribution amount in purchase tokens
     * @param maxContributionAmount The max contribution amount for this address
     */
    function whitelistPurchase(
        bytes32[] calldata merkleProof,
        uint256 contributionAmount,
        uint256 maxContributionAmount
    ) external payable {
        require(isWhitelistMintPeriod(), "Not whitelist period");
        bytes32 leaf = keccak256(
            abi.encodePacked(msg.sender, maxContributionAmount)
        );
        // Verify address is whitelisted
        // Requires address and max contribution amount for that address
        require(
            MerkleProof.verify(merkleProof, whitelistMerkleRoot, leaf),
            "Address not whitelisted"
        );
        // If contribution amount is exceeded invest as much as possible
        if (
            purchaseTokenContribution[msg.sender] + contributionAmount >
            maxContributionAmount
        ) {
            contributionAmount =
                maxContributionAmount -
                purchaseTokenContribution[msg.sender];
            // If user has reached his limit completely revert
            require(
                contributionAmount != 0,
                "User has reached his max contribution amount"
            );
        }

        _purchase(contributionAmount);
    }

    /**
     * @dev Purchases the offer token with a contribution amount of purchase tokens
     * @dev If purchasing with ETH, contribution amount must equal ETH sent
     *
     * @param contributionAmount The contribution amount in purchase tokens
     */
    function purchase(uint256 contributionAmount) external payable {
        require(isPublicMintPeriod(), "Not public mint period");

        _purchase(contributionAmount);
    }

    function _purchase(uint256 contributionAmount) internal nonReentrant {
        require(saleInitiated, "Sale not open");
        require(
            block.timestamp <= saleEndTimestamp,
            "Sale not started or over"
        );
        require(contributionAmount > 0, "Must contribute");

        address sender = msg.sender;
        if (address(purchaseToken) == address(0)) {
            // purchase token is eth
            require(msg.value == contributionAmount);
        } else {
            purchaseToken.safeTransferFrom(
                sender,
                address(this),
                contributionAmount
            );
        }

        uint256 offerTokenAmount = getCurrentMintAmount(contributionAmount);
        uint256 feeInPurchaseToken = _divUp(
            contributionAmount * originationFee,
            1e18
        );

        // Check if over the total offering amount
        if (offerTokenAmountSold + offerTokenAmount > totalOfferingAmount) {
            // Refund sender for the extra amount sent
            uint256 refundAmountInOfferTokens = offerTokenAmountSold +
                offerTokenAmount -
                totalOfferingAmount;
            uint256 refundAmount = getPurchaseAmountFromOfferAmount(
                refundAmountInOfferTokens
            );
            _returnPurchaseTokens(msg.sender, refundAmount);

            // Modify token amount, contribution amount and fee amount
            contributionAmount -= refundAmount;
            offerTokenAmount = totalOfferingAmount - offerTokenAmountSold;
            feeInPurchaseToken = _divUp(contributionAmount, 1e18);

            // Indicate sale is over
            saleEndTimestamp = block.timestamp;
        }

        // Update the sale trackers
        offerTokenAmountPurchased[sender] += offerTokenAmount;
        purchaseTokenContribution[sender] += contributionAmount;
        offerTokenAmountSold += offerTokenAmount;
        purchaseTokensAcquired += contributionAmount;
        originationCoreFees += feeInPurchaseToken;

        // Make sure offer token amount sold is not greater than the sale offering
        require(
            offerTokenAmountSold <= totalOfferingAmount,
            "Sale amount greater than offering"
        );

        if (vestingPeriod > 0) {
            _createVestingEntry(sender, offerTokenAmount);
        }

        emit Purchase(
            sender,
            contributionAmount,
            offerTokenAmount,
            feeInPurchaseToken
        );
    }

    /**
     * @dev Creates or modifies a vesting entry for purchaser
     * @dev mints a nft which represents the vesting entry
     * @dev NFT has token amount and claimed amount
     * @param _sender The purchaser
     * @param _offerTokenAmount The offer token amount
     */
    function _createVestingEntry(address _sender, uint256 _offerTokenAmount)
        private
    {
        // Add user address to vesting id mapping
        userToVestingId[_sender] = vestingID;

        vestingEntryNFT.mint(
            _sender,
            vestingID,
            IVestingEntryNFT.VestingAmounts({
                tokenAmount: _offerTokenAmount,
                tokenAmountClaimed: 0
            })
        );

        emit CreateVestingEntry(_sender, vestingID, _offerTokenAmount);
        vestingID++;

        vestableTokenAmount += _offerTokenAmount;
    }

    /**
     * @dev Claims vesting entries
     * @dev If sale did not reach reserve amount vesting entries are canceled
     * @dev Users claiming their vestings must hold the nft representing the vesting entry
     * @param _nftIds The vesting entries ids
     */
    function claimVested(uint256[] calldata _nftIds) external nonReentrant {
        require(_nftIds.length > 0, "No vesting entry NFT id provided");
        require(
            saleEndTimestamp + cliffPeriod < block.timestamp,
            "Not past cliff period"
        );
        require(purchaseTokensAcquired >= reserveAmount, "Sale reserve amount not met");

        for (uint256 i = 0; i < _nftIds.length; i++) {
            uint256 entryId = _nftIds[i];
            (
                uint256 tokenAmount,
                uint256 tokenAmountClaimed
            ) = vestingEntryNFT.tokenIdVestingAmounts(entryId);
            address ownerOfEntry = vestingEntryNFT.ownerOf(entryId);
            require(
                ownerOfEntry == msg.sender,
                "User not owner of vest id"
            );
            require(
                tokenAmount != tokenAmountClaimed,
                "User has already claimed his token vesting"
            );

            uint256 offerTokenPayout = calculateClaimableVestedAmount(
                tokenAmount,
                tokenAmountClaimed
            );
            uint256 tokenAmountRemaining = tokenAmount - tokenAmountClaimed;
            vestingEntryNFT.setVestingAmounts(
                entryId,
                tokenAmount,
                tokenAmountClaimed + offerTokenPayout
            );

            offerToken.safeTransfer(msg.sender, offerTokenPayout);
            vestableTokenAmount -= offerTokenPayout;

            emit ClaimVested(
                msg.sender,
                offerTokenPayout,
                tokenAmountRemaining
            );
        }
    }

    /**
     * @dev User callable function that will either return purchase tokens or the acquired offer tokens
     * @dev Can only be called at the conclusion of the sale
     */
    function claimTokens() external nonReentrant {
        require(block.timestamp > saleEndTimestamp, "Sale has not ended");

        uint256 tokenAmount;
        if (purchaseTokensAcquired >= reserveAmount) {
            // Sale reached the reserve amount therefore send acquired offer tokens
            require(
                offerTokenAmountPurchased[msg.sender] > 0,
                "No purchase made"
            );
            require(
                vestingPeriod == 0,
                "Tokens must be claimed using claimVested"
            );
            tokenAmount = offerTokenAmountPurchased[msg.sender];
            offerTokenAmountPurchased[msg.sender] = 0;
            offerToken.safeTransfer(msg.sender, tokenAmount);
        } else {
            // Sale did not reach reserve amount therefore return purchase tokens
            require(
                purchaseTokenContribution[msg.sender] > 0,
                "No contribution made"
            );
            tokenAmount = purchaseTokenContribution[msg.sender];
            purchaseTokenContribution[msg.sender] = 0;
            _returnPurchaseTokens(msg.sender, tokenAmount);
        }
    }

    function _returnPurchaseTokens(address purchaser, uint256 tokenAmount)
        internal
    {
        if (address(purchaseToken) == address(0)) {
            // send eth
            (bool success, ) = payable(purchaser).call{value: tokenAmount}("");
            require(success);
        } else {
            purchaseToken.safeTransfer(purchaser, tokenAmount);
        }
    }

    //--------------------------------------------------------------------------
    // View Functions
    //--------------------------------------------------------------------------

    /**
     * @dev Calculates the amount of tokens mintable by a given purchase token amount
     *
     * @param contributionAmount The contribution amount of purchase tokens
     * @return offerTokenAmount The offer token amount mintable
     */
    function getCurrentMintAmount(uint256 contributionAmount)
        public
        view
        returns (uint256 offerTokenAmount)
    {
        require(
            block.timestamp <= saleEndTimestamp,
            "Sale not started or over"
        );

        uint256 offerTokenPrice = getOfferTokenPrice();

        // following line has 2 operations:
        //    1. Convert contribution amount to Offer Tokens (contribution / price)
        //    2. Convert previous operation from purchase token decimals to offer token decimals
        offerTokenAmount = _divUp(
            _divUp(
                contributionAmount * purchaseTokenDecimals,
                offerTokenPrice
            ) * offerTokenDecimals,
            purchaseTokenDecimals
        );
    }

    /**
     * @dev Get purchase token amount from offer token amount
     * @param offerAmount offer token amount
     * @return purchaseAmount purchase token amount
     */
    function getPurchaseAmountFromOfferAmount(uint256 offerAmount)
        public
        view
        returns (uint256 purchaseAmount)
    {
        require(
            block.timestamp <= saleEndTimestamp,
            "Sale not started or over"
        );

        uint256 offerTokenPrice = getOfferTokenPrice();

        purchaseAmount = _divUp(
            _divUp(offerAmount * offerTokenPrice, purchaseTokenDecimals) *
                purchaseTokenDecimals,
            offerTokenDecimals
        );
    }

    /**
     * Return offer token price in purchase tokens (eth or erc-20)
     */
    function getOfferTokenPrice()
        public
        view
        returns (uint256 offerTokenPrice)
    {
        uint256 timeElapsed = block.timestamp - saleInitiatedTimestamp;
        // Whitelist mint period has different start and end prices
        uint256 _startingPrice = isWhitelistMintPeriod()
            ? whitelistStartingPrice
            : publicStartingPrice;
        uint256 _endingPrice = isWhitelistMintPeriod()
            ? whitelistEndingPrice
            : publicEndingPrice;
        // Get the start / end price difference
        uint256 saleRange = _startingPrice < _endingPrice
            ? _endingPrice - _startingPrice
            : _startingPrice - _endingPrice;
        uint256 saleCompletionRatio = (saleDuration * TIME_PRECISION) /
            timeElapsed;
        uint256 saleDelta = (saleRange * TIME_PRECISION) / saleCompletionRatio;
        // Determine the offer token price in purchase tokens
        offerTokenPrice = _startingPrice < _endingPrice
            ? _startingPrice + saleDelta
            : _startingPrice - saleDelta;
    }

    /**
     * @dev Calculates the claimable vested offer token
     *
     * @param tokenAmount the token amount
     * @param tokenAmountClaimed the claimed token amount
     * @return claimableTokenAmount The claimable offer token amount
     */
    function calculateClaimableVestedAmount(
        uint256 tokenAmount,
        uint256 tokenAmountClaimed
    ) public view returns (uint256 claimableTokenAmount) {
        require(
            saleEndTimestamp + cliffPeriod < block.timestamp,
            "Not past cliff period"
        );

        uint256 timeSinceInit = block.timestamp - saleEndTimestamp;
        
        claimableTokenAmount = timeSinceInit >= vestingPeriod
            ? tokenAmount - tokenAmountClaimed
            : ((timeSinceInit * tokenAmount) / vestingPeriod) -
                tokenAmountClaimed;
    }

    function isWhitelistMintPeriod() public view returns (bool) {
        return
            block.timestamp > saleInitiatedTimestamp &&
            block.timestamp <= (saleInitiatedTimestamp + whitelistSaleDuration);
    }

    function isPublicMintPeriod() public view returns (bool) {
        uint256 endOfWhitelistPeriod = saleInitiatedTimestamp +
            whitelistSaleDuration;
        return
            block.timestamp > endOfWhitelistPeriod &&
            block.timestamp <= (endOfWhitelistPeriod + publicSaleDuration);
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

    //--------------------------------------------------------------------------
    // Admin Functions
    //--------------------------------------------------------------------------

    /**
     * @dev Admin function used to initiate the sale
     * @dev Function will transfer the total offer tokens from admin to contract
     */
    function initiateSale() external onlyOwnerOrManager {
        require(!saleInitiated, "Sale already initiated");

        offerToken.safeTransferFrom(
            msg.sender,
            address(this),
            totalOfferingAmount
        );
        saleInitiated = true;
        saleInitiatedTimestamp = block.timestamp;
        saleEndTimestamp = saleInitiatedTimestamp + saleDuration;

        emit InitiateSale(totalOfferingAmount);
    }

    /**
     * @dev Admin function to claim the purchase tokens from the sale
     * @dev Can only claim at the conclusion of the sale
     * @dev Returns unsold offer tokens or all offer tokens if reserve amount was not met
     */
    function claimPurchaseToken() external onlyOwnerOrManager {
        require(block.timestamp > saleEndTimestamp, "Sale has not ended");
        require(!sponsorTokensClaimed, "Tokens already claimed");
        sponsorTokensClaimed = true;

        // check if reserve amount was reached
        if (purchaseTokensAcquired >= reserveAmount) {
            uint256 claimAmount;
            if (address(purchaseToken) == address(0)) {
                // purchaseToken = eth
                claimAmount = address(this).balance - originationCoreFees;
                (bool success, ) = owner().call{value: claimAmount}("");
                require(success);
                // send fees to core
                originationCore.receiveFees{value: originationCoreFees}();
            } else {
                claimAmount =
                    purchaseToken.balanceOf(address(this)) -
                    originationCoreFees;
                purchaseToken.safeTransfer(owner(), claimAmount);
                purchaseToken.safeTransfer(
                    address(originationCore),
                    originationCoreFees
                );
            }

            // return the unsold offerTokens
            if (offerTokenAmountSold < totalOfferingAmount) {
                offerToken.safeTransfer(
                    owner(),
                    totalOfferingAmount - offerTokenAmountSold
                );
            }

            emit PurchaseTokenClaim(owner(), claimAmount);
        } else {
            // return all offer tokens back to owner
            offerToken.safeTransfer(
                owner(),
                offerToken.balanceOf(address(this))
            );
        }
    }

    /**
     * @dev Admin function to set a whitelist
     *
     * @param _whitelistMerkleRoot The whitelist merkle root
     */
    function setWhitelist(bytes32 _whitelistMerkleRoot)
        external
        onlyOwnerOrManager
    {
        require(!saleInitiated, "Cannot set whitelist after sale initiated");

        whitelistMerkleRoot = _whitelistMerkleRoot;
    }

    /**
     * @dev Admin function to set a manager
     * @dev Manager has same rights as owner (except setting a manager)
     *
     * @param _manager The manager address
     */
    function setManager(address _manager) external onlyOwner {
        manager = _manager;
    }

    //--------------------------------------------------------------------------
    // Utils Functions
    //--------------------------------------------------------------------------

    /**
     * @dev Divides num by div, rounding up
     */
    function _divUp(uint256 num, uint256 div) internal pure returns (uint256) {
        return (num + div - 1) / div;
    }
}
