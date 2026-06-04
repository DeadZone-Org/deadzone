// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDeadzoneToken {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

/**
 * @title DeadzoneSettlement
 * @notice The on-chain settlement + record layer for DEADZONE's autonomous gateway agents.
 *         A courier (the AI Settlement Agent's wallet) calls this to settle payments it carried
 *         across the Bluetooth mesh. Every settlement records WHICH courier (its ERC-8004 agentId)
 *         delivered the payment — the basis for the courier's on-chain reputation and an optional tip.
 *
 *         - `settle`       : settle one offline-signed authorization, attributed to a courier agentId.
 *         - `settleBatch`  : settle many in one tx (the agent's gas-optimization win on Mantle).
 *         - `settledBy`    : nonce => courier agentId, read by the reputation/leaderboard layer.
 *
 * @dev    The optional tip is paid by the courier forwarding a SECOND EIP-3009 authorization the
 *         sender signed (sender -> courier), i.e. a genuine agent-to-agent payment. v1 records
 *         attribution + events; the tip authorization is just another item in a batch.
 */
contract DeadzoneSettlement {
    IDeadzoneToken public immutable token;

    /// nonce => courier ERC-8004 agentId that settled it (0 = unsettled here)
    mapping(bytes32 => uint256) public settledBy;
    /// courier agentId => count of payments delivered (cheap on-chain reputation counter)
    mapping(uint256 => uint256) public deliveries;

    struct Authorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        bytes signature;
    }

    event Settled(
        bytes32 indexed nonce,
        uint256 indexed courierAgentId,
        address indexed from,
        address to,
        uint256 value
    );
    event BatchSettled(uint256 indexed courierAgentId, uint256 count, uint256 failed);

    constructor(address token_) {
        token = IDeadzoneToken(token_);
    }

    /// @notice Settle a single payment the courier carried, attributed to its ERC-8004 agentId.
    function settle(uint256 courierAgentId, Authorization calldata a) external {
        _settle(courierAgentId, a);
    }

    /// @notice Settle many payments in one transaction. Failed items are skipped (try/catch) so one
    ///         bad authorization can't grief the batch — the agent's self-correction, enforced on-chain.
    /// @return settledCount number that succeeded, failedCount number skipped.
    function settleBatch(uint256 courierAgentId, Authorization[] calldata items)
        external
        returns (uint256 settledCount, uint256 failedCount)
    {
        for (uint256 i = 0; i < items.length; i++) {
            try this.settleExternal(courierAgentId, items[i]) {
                settledCount++;
            } catch {
                failedCount++;
            }
        }
        emit BatchSettled(courierAgentId, settledCount, failedCount);
    }

    /// @dev External self-call hook so a single revert inside a batch is catchable.
    function settleExternal(uint256 courierAgentId, Authorization calldata a) external {
        require(msg.sender == address(this), "Deadzone: internal only");
        _settle(courierAgentId, a);
    }

    function _settle(uint256 courierAgentId, Authorization calldata a) internal {
        require(settledBy[a.nonce] == 0, "Deadzone: already settled here");
        token.transferWithAuthorization(
            a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.signature
        );
        settledBy[a.nonce] = courierAgentId;
        deliveries[courierAgentId] += 1;
        emit Settled(a.nonce, courierAgentId, a.from, a.to, a.value);
    }
}
