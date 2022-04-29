//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "./IOriginationCore.sol";

interface INonFungibleOriginationPool {
    struct SaleParams {
        // the 721 NFT contract to mint
        address collection;
        // max supply mintable via Origination (maxWhitelistMint + implicit public sale mint)
        uint256 maxTotalMintable;
        // maximum a whitelisted address can mint
        uint256 maxMintablePerWhitelistedAddress;
        // max supply reserved for minters during whitelist period
        uint256 maxWhitelistMintable;
        // the token used to purchase the nfts (can be eth)
        address purchaseToken;
        // public sale starting price
        uint256 publicStartingPrice;
        // public sale end price
        uint256 publicEndingPrice;
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
