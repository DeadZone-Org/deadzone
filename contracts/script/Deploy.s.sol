// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DeadzoneToken.sol";
import "../src/DeadzoneSettlement.sol";
import "../src/DeadzoneRegistry.sol";

/**
 * Deploy DEADZONE's full on-chain stack to Mantle: the EIP-3009 token, the settlement
 * layer, and the three ERC-8004 registries (identity / validation / reputation).
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
        IdentityRegistry identity = new IdentityRegistry();
        ValidationRegistry validation = new ValidationRegistry();
        ReputationRegistry reputation = new ReputationRegistry();
        vm.stopBroadcast();

        console2.log("== DEADZONE deployed on Mantle ==");
        console2.log("deployer          :", deployer);
        console2.log("DeadzoneToken     :", address(token));
        console2.log("DeadzoneSettlement:", address(settlement));
        console2.log("IdentityRegistry  :", address(identity));
        console2.log("ValidationRegistry:", address(validation));
        console2.log("ReputationRegistry:", address(reputation));
        console2.log("dUSD supply       : 1,000,000 (minted to deployer)");
    }
}
