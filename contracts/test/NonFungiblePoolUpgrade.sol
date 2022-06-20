//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "../NonFungibleOriginationPool.sol";

contract NonFungiblePoolUpgrade is NonFungibleOriginationPool {
    function newFunction() external pure returns (uint256) {
        return 10;
    }
}
