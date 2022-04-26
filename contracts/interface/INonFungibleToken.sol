//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface INonFungibleToken is IERC721 {
    function mintTo(address minter, uint256 quantityToMint) external;

    function setOriginationInstance(address instance) external;
}
