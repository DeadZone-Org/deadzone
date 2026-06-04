// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DeadzoneToken.sol";
import "../src/DeadzoneSettlement.sol";

contract DeadzoneTest is Test {
    DeadzoneToken token;
    DeadzoneSettlement settlement;

    uint256 alicePk = 0xA11CE;
    address alice = vm.addr(0xA11CE);
    address charlie = address(0xC0FFEE);
    address courierWallet = address(0xCAFE); // the AI agent's settlement wallet (pays gas)
    uint256 constant DEADZONE_AGENT_ID = 8004; // its ERC-8004 agentId

    bytes32 DOMAIN_SEPARATOR;
    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        vm.warp(1000); // move time forward so expiry windows are meaningful
        token = new DeadzoneToken("Deadzone USD", "dUSD", 1_000_000e18);
        settlement = new DeadzoneSettlement(address(token));
        token.transfer(alice, 1_000e18); // fund alice (the offline sender)

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Deadzone USD")),
                keccak256(bytes("1")),
                block.chainid,
                address(token)
            )
        );
    }

    /// Build the offline EIP-3009 signature exactly as a phone would (no internet needed to sign).
    function _sign(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (bytes memory sig)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), from, to, value, validAfter, validBefore, nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _auth(address to, uint256 value, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (DeadzoneSettlement.Authorization memory a)
    {
        a = DeadzoneSettlement.Authorization({
            from: alice,
            to: to,
            value: value,
            validAfter: 0,
            validBefore: validBefore,
            nonce: nonce,
            signature: _sign(alice, to, value, 0, validBefore, nonce)
        });
    }

    /// Core flow: alice signs offline -> courier settles on-chain -> money moved + courier attributed.
    function test_DeadzoneSettlesOfflinePayment() public {
        DeadzoneSettlement.Authorization memory a = _auth(charlie, 100e18, block.timestamp + 1 days, keccak256("n1"));

        vm.prank(courierWallet); // the courier (gateway agent) pays the gas
        settlement.settle(DEADZONE_AGENT_ID, a);

        assertEq(token.balanceOf(charlie), 100e18, "recipient should receive the offline payment");
        assertEq(token.balanceOf(alice), 900e18, "sender debited");
        assertEq(settlement.settledBy(keccak256("n1")), DEADZONE_AGENT_ID, "courier attributed on-chain");
        assertEq(settlement.deliveries(DEADZONE_AGENT_ID), 1, "courier reputation counter incremented");
    }

    /// A payment can only be settled once (replay protection across the mesh).
    function test_NoDoubleSettle() public {
        DeadzoneSettlement.Authorization memory a = _auth(charlie, 50e18, block.timestamp + 1 days, keccak256("n2"));
        vm.prank(courierWallet);
        settlement.settle(DEADZONE_AGENT_ID, a);

        vm.prank(courierWallet);
        vm.expectRevert(); // already settled here / nonce used
        settlement.settle(DEADZONE_AGENT_ID, a);
    }

    /// Batch settlement with one expired auth: the good ones land, the bad one is skipped (self-correction).
    function test_BatchSkipsBadAuthorization() public {
        DeadzoneSettlement.Authorization[] memory items = new DeadzoneSettlement.Authorization[](3);
        items[0] = _auth(charlie, 10e18, block.timestamp + 1 days, keccak256("b1")); // valid
        items[1] = _auth(charlie, 20e18, block.timestamp - 1, keccak256("b2"));      // EXPIRED -> skipped
        items[2] = _auth(charlie, 30e18, block.timestamp + 1 days, keccak256("b3")); // valid

        vm.prank(courierWallet);
        (uint256 settled, uint256 failed) = settlement.settleBatch(DEADZONE_AGENT_ID, items);

        assertEq(settled, 2, "two valid payments settled");
        assertEq(failed, 1, "one expired payment skipped, not reverting the batch");
        assertEq(token.balanceOf(charlie), 40e18, "only valid payments moved value");
        assertEq(settlement.deliveries(DEADZONE_AGENT_ID), 2, "reputation counts only delivered payments");
    }
}
