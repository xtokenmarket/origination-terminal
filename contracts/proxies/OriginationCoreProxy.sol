// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract OriginationCoreProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _proxyAdmin) TransparentUpgradeableProxy(_logic, _proxyAdmin, "") {}
}
