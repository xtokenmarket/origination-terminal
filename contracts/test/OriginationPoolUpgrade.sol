//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "../FungibleOriginationPool.sol";

contract OriginationPoolUpgrade is FungibleOriginationPool {
    function newFunction() external pure returns (uint256) {
        return 10;
    }
}
