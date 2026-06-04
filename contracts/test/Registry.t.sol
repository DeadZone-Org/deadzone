// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DeadzoneRegistry.sol";

contract RegistryTest is Test {
    IdentityRegistry id;
    ValidationRegistry val;
    ReputationRegistry rep;

    address courier = address(0xCAFE);

    function setUp() public {
        id = new IdentityRegistry();
        val = new ValidationRegistry();
        rep = new ReputationRegistry();
    }

    function test_RegisterMintsIncrementingIdentityNFT() public {
        vm.prank(courier);
        uint256 agentId = id.register("ipfs://agentcard-1");
        assertEq(agentId, 1);
        assertEq(id.ownerOf(agentId), courier);
        assertEq(id.tokenURI(agentId), "ipfs://agentcard-1");
        assertEq(id.totalAgents(), 1);
    }

    function test_BindAgentWallet() public {
        vm.prank(courier);
        uint256 agentId = id.register("ipfs://c");
        vm.prank(courier);
        id.setAgentWallet(agentId, address(0xBEEF));
        assertEq(id.getAgentWallet(agentId), address(0xBEEF));
    }

    function test_PreCommitThenRevealValidation() public {
        bytes32 reqHash = keccak256("decision-batch-7");
        val.validationRequest(courier, 1, "ipfs://plan", reqHash);

        // before reveal: recorded, not yet responded
        (, uint256 agentId, uint8 resp,,, uint256 lastUpdate) = val.getValidationStatus(reqHash);
        assertEq(agentId, 1);
        assertEq(resp, 0);
        assertGt(lastUpdate, 0);

        // reveal the realized outcome
        val.validationResponse(reqHash, 100, "ipfs://outcome", keccak256("outcome"), "honest-relay");
        (,, uint8 resp2,, string memory tag,) = val.getValidationStatus(reqHash);
        assertEq(resp2, 100);
        assertEq(tag, "honest-relay");

        bytes32[] memory reqs = val.getAgentValidations(1);
        assertEq(reqs.length, 1);
        assertEq(reqs[0], reqHash);
    }

    function test_CannotRespondTwice() public {
        bytes32 reqHash = keccak256("d");
        val.validationRequest(courier, 1, "u", reqHash);
        val.validationResponse(reqHash, 100, "u", bytes32(0), "t");
        vm.expectRevert();
        val.validationResponse(reqHash, 50, "u", bytes32(0), "t");
    }

    function test_ReputationAggregates() public {
        rep.giveFeedback(1, 100, 0, "honest-relay", "", "", "ipfs://f1", bytes32(0));
        rep.giveFeedback(1, 80, 0, "honest-relay", "", "", "ipfs://f2", bytes32(0));
        (uint64 count, int128 summary) = rep.getSummary(1);
        assertEq(count, 2);
        assertEq(summary, 90); // (100 + 80) / 2
    }
}
