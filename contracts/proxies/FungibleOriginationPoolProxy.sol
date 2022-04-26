// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "./TransparentUpgradeableProxy.sol";
import "../interface/IPoolDeployer.sol";

contract FungibleOriginationPoolProxy is TransparentUpgradeableProxy {
    IPoolDeployer poolDeployer;

    constructor(
        address _logic,
        address _proxyAdmin,
        address _poolDeployer
    ) TransparentUpgradeableProxy(_logic, _proxyAdmin, "") {
        poolDeployer = IPoolDeployer(_poolDeployer);
    }

    function upgradeTo(address _implementation) external override ifAdmin {
        require(
            poolDeployer.fungibleOriginationPoolImplementation() == _implementation,
            "Can only upgrade to latest fungibleOriginationPool implementation"
        );
        _upgradeTo(_implementation);
    }

    function upgradeToAndCall(address _implementation, bytes calldata data) external payable override ifAdmin {
        require(
            poolDeployer.fungibleOriginationPoolImplementation() == _implementation,
            "Can only upgrade to latest fungibleOriginationPool implementation"
        );
        _upgradeTo(_implementation);
        Address.functionDelegateCall(_implementation, data);
    }
}
