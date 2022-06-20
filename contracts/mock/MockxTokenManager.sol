//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockxTokenManager is Ownable {
    // key address corresponds to a manager
    // of an map of fund to whether the address manages that fund
    mapping(address => mapping(address => bool)) managers;

    // address which can withdraw fund fees
    address revenueController;

    /**
     * @dev Add a manager to an xAsset fund
     */
    function addManager(address manager, address fund) external onlyOwner {
        if (!managers[manager][fund]) {
            managers[manager][fund] = true;
        }
    }

    /**
     * @dev Remove a manager from an xAsset fund
     */
    function removeManager(address manager, address fund) external onlyOwner {
        require(managers[manager][fund], "Address is not manager of this fund");
        managers[manager][fund] = false;
    }

    /**
     * @dev Check if an address is a manager for a fund
     */
    function isManager(address manager, address fund)
        public
        view
        returns (bool)
    {
        return managers[manager][fund];
    }

    /**
     * @dev Set revenue controller
     */
    function setRevenueController(address controller) external onlyOwner {
        require(
            revenueController == address(0),
            "Revenue controller can be set only once"
        );
        revenueController = controller;
    }

    /**
     * @dev Check if address is revenue controller
     */
    function isRevenueController(address caller) public view returns (bool) {
        return revenueController == caller;
    }
}
