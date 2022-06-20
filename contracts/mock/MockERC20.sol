// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private dec;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        dec = decimals_;
        _mint(msg.sender, 10000000000e18);
    }

    function decimals() public view override returns (uint8) {
        return dec;
    }
}
