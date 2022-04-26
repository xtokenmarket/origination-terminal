//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "./IOriginationCore.sol";

interface IFungibleOriginationPool {
    struct Whitelist {
        bool enabled; // if disabled, the merkle root and purchase cap values are ignored
        bytes32 whitelistMerkleRoot; // the merkle root used to determine if an address is whitelisted
        uint256 purchaseCap; // the max amount of tokens an address can purchase
    }

    struct SaleParams {
        address offerToken; // the token being offered for sale
        address purchaseToken; // the token used to purchase the offered token
        uint256 startingPrice; // in purchase tokens
        uint256 endingPrice; // in purchase tokens
        uint256 whitelistStartingPrice; // in purchase tokens
        uint256 whitelistEndingPrice; // in purchase tokens
        uint256 publicSaleDuration; // the public sale duration
        uint256 whitelistSaleDuration; // the whitelist sale duration
        uint256 totalOfferingAmount; // the total amount of offer tokens for sale
        uint256 reserveAmount; // need to raise this amount of purchase tokens for sale completion
        uint256 vestingPeriod; // the total vesting period (can be 0)
        uint256 cliffPeriod; // the cliff period in case of vesting (must be <= vesting period)
    }

    struct VestingEntry {
        address user; // the user's address with the vesting position
        uint256 offerTokenAmount; // the total vesting position amount
        uint256 offerTokenAmountClaimed; // the amount of tokens claimed so far
    }

    function initialize(
        uint256 originationFee,
        IOriginationCore core,
        address admin,
        address vestingEntryNFT,
        SaleParams calldata saleParams
    ) external;
}
