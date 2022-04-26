// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/Proxy.sol";

contract VestingEntryNFTProxy is Proxy {
    address public implementation;

    constructor(address _logic) Proxy() {
        implementation = _logic;
    }

    function _implementation() internal view override returns (address) {
        return implementation;
    }
}
