//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "./IOriginationCore.sol";

interface INonFungibleOriginationPool {
    struct Whitelist {
        bool enabled; // if disabled, the merkle root and purchase cap values are ignored
        bytes32 whitelistMerkleRoot; // the merkle root used to determine if an address is whitelisted
        uint256 purchaseCap; // the max amount of tokens an address can purchase
    }

    struct SaleParams {
        // the 721 NFT contract to mint
        address collection;
        // max supply mintable via Origination (maxWhitelistMint + implicit public sale mint)
        uint256 maxTotalMintable;
        // maximum a single address can mint
        uint256 maxMintablePerAddress;
        // max supply reserved for minters during whitelist period
        uint256 maxWhitelistMintable;
        // public sale starting price
        uint256 startingPrice;
        // public sale end price
        uint256 endingPrice;
        // whitelist sale starting price
        uint256 whitelistStartingPrice;
        // whitelist sale end price
        uint256 whitelistEndingPrice;
        // the whitelist sale duration
        uint256 whitelistSaleDuration;
        // the public sale duration
        uint256 publicSaleDuration;
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
        SaleParams calldata saleParams
    ) external;
}
