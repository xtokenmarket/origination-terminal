//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface IPoolDeployer {
    function fungibleOriginationPoolImplementation()
        external
        view
        returns (address);

    function nonFungibleOriginationPoolImplementation()
        external
        view
        returns (address);

    function deployFungibleOriginationPool(address _proxyAdmin)
        external
        returns (address pool);

    function deployNonFungibleOriginationPool(address _proxyAdmin)
        external
        returns (address token);

    function setFungibleOriginationPoolImplementation(
        address _fungibleOriginationPoolImplementation
    ) external;

    function setNonFungibleOriginationPoolImplementation(
        address _nonFungibleOriginationPoolImplementation
    ) external;

    function owner() external view returns (address);

    function renounceOwnership() external;

    function transferOwnership(address newOwner) external;
}
