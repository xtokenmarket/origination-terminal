// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "./proxies/FungibleOriginationPoolProxy.sol";
import "./proxies/NonFungibleOriginationPoolProxy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Manages deployment of fungible and non-fungible origination pool proxies
 * Deploys fungible proxies pointing to fungible origination pool implementation
 * Deploys non-fungible proxies pointing to non-fungible origination pool implementation
 */
contract PoolDeployer is Ownable {
    address public fungibleOriginationPoolImplementation;
    address public nonFungibleOriginationPoolImplementation;

    constructor(
        address _fungibleOriginationPoolImplementation,
        address _nonFungibleOriginationPoolImplementation
    ) {
        fungibleOriginationPoolImplementation = _fungibleOriginationPoolImplementation;
        nonFungibleOriginationPoolImplementation = _nonFungibleOriginationPoolImplementation;
        emit FungibleOriginationPoolImplementationSet(
            _fungibleOriginationPoolImplementation
        );
        emit NonFungibleOriginationPoolImplementationSet(
            _nonFungibleOriginationPoolImplementation
        );
    }

    function deployFungibleOriginationPool(address _proxyAdmin)
        external
        returns (address pool)
    {
        FungibleOriginationPoolProxy proxy = new FungibleOriginationPoolProxy(
            fungibleOriginationPoolImplementation,
            _proxyAdmin,
            address(this)
        );
        return address(proxy);
    }

    function deployNonFungibleOriginationPool(address _proxyAdmin)
        external
        returns (address pool)
    {
        NonFungibleOriginationPoolProxy proxy = new NonFungibleOriginationPoolProxy(
                nonFungibleOriginationPoolImplementation,
                _proxyAdmin,
                address(this)
            );
        return address(proxy);
    }

    function setFungibleOriginationPoolImplementation(
        address _fungibleOriginationPoolImplementation
    ) external onlyOwner {
        fungibleOriginationPoolImplementation = _fungibleOriginationPoolImplementation;
        emit FungibleOriginationPoolImplementationSet(
            _fungibleOriginationPoolImplementation
        );
    }

    function setNonFungibleOriginationPoolImplementation(
        address _nonFungibleOriginationPoolImplementation
    ) external onlyOwner {
        nonFungibleOriginationPoolImplementation = _nonFungibleOriginationPoolImplementation;
        emit NonFungibleOriginationPoolImplementationSet(
            _nonFungibleOriginationPoolImplementation
        );
    }

    // Events

    event FungibleOriginationPoolImplementationSet(
        address indexed fungibleOriginationPoolImplementation
    );

    event NonFungibleOriginationPoolImplementationSet(
        address indexed nonFungibleOriginationPoolImplementation
    );
}
