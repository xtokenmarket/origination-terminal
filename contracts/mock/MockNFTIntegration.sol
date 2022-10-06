//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract MockNFTIntegration is ERC721Enumerable {
    address originationCore;
    address originationInstance;

    constructor(
        address _originationCore,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        originationCore = _originationCore;
    }

    function setOriginationInstance(address _originationInstance) external {
        require(msg.sender == originationCore, "Invalid setter");
        require(originationInstance == address(0), "Address already set");
        originationInstance = _originationInstance;
    }

    function mintTo(address _minter, uint256 _quantityToMint) external {
        require(msg.sender == originationInstance, "Invalid minter");
        uint256 tokenId = totalSupply();
        for (uint256 i = 0; i < _quantityToMint; i++) {
            _mint(_minter, tokenId);
            tokenId++;
        }
    }
}
