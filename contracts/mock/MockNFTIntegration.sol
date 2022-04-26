//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNFTIntegration is ERC721 {
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

        // other logic as desired

        for (uint256 i = 0; i < _quantityToMint; i++) {
            _mint(_minter, 1);
        }

        // other logic as desired
    }
}
