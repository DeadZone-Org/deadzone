// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DeadzoneToken.sol";
import "../src/DeadzoneSettlement.sol";

/**
 * Deploy DEADZONE's on-chain core to Mantle.
 *   cd contracts
 *   forge script script/Deploy.s.sol:Deploy --rpc-url $MANTLE_SEPOLIA_RPC --broadcast
 *
 * Reads PRIVATE_KEY from contracts/.env (auto-loaded by Foundry).
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        DeadzoneToken token = new DeadzoneToken("Deadzone USD", "dUSD", 1_000_000 ether);
        DeadzoneSettlement settlement = new DeadzoneSettlement(address(token));
        vm.stopBroadcast();

        console2.log("== DEADZONE deployed on Mantle ==");
        console2.log("deployer         :", deployer);
        console2.log("DeadzoneToken :", address(token));
        console2.log("DeadzoneSettlement:", address(settlement));
        console2.log("dUSD supply      : 1,000,000 (minted to deployer)");
    }
}
