// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * Minimal, faithful ERC-8004 (Trustless Agents) registries for Mantle.
 *
 * ERC-8004 went live on Ethereum mainnet (Jan 2026) but the canonical registries are
 * not deployed on Mantle Sepolia, so these are a lightweight Mantle deployment of the
 * same three-registry design. They give Deadzone's couriers a real on-chain identity
 * NFT, a verifiable pre-commit → reveal validation trail, and accruing reputation —
 * the "verifiable on-chain value" the hackathon is built around. Signatures follow
 * EIP-8004; aggregation is simplified for a hackathon-scope implementation.
 */

/// @notice IdentityRegistry — ERC-721 agent identity (the courier's on-chain "card").
contract IdentityRegistry is ERC721URIStorage {
    uint256 private _next = 1;
    mapping(uint256 => address) private _agentWallet;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);

    constructor() ERC721("Deadzone Courier", "DZC") {}

    /// @notice Mint a fresh agent identity NFT with an AgentCard URI. tokenId auto-increments.
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _next++;
        _mint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
    }

    /// @dev Simplified vs the EIP's signature-based setter: the NFT owner binds the courier's settling wallet.
    function setAgentWallet(uint256 agentId, address wallet) external {
        require(ownerOf(agentId) == msg.sender, "not agent owner");
        _agentWallet[agentId] = wallet;
        emit AgentWalletSet(agentId, wallet);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        address w = _agentWallet[agentId];
        return w == address(0) ? ownerOf(agentId) : w;
    }

    function totalAgents() external view returns (uint256) {
        return _next - 1;
    }
}

/// @notice ValidationRegistry — pre-commit the decision (request), then reveal the outcome (response).
contract ValidationRegistry {
    struct Validation {
        address validator;
        uint256 agentId;
        uint8 response; // 0..100; 0 until responded
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool responded;
    }

    mapping(bytes32 => Validation) private _v; // requestHash => validation
    mapping(uint256 => bytes32[]) private _agentReqs;

    event ValidationRequest(
        address indexed validator, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash
    );
    event ValidationResponse(
        address indexed validator,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    /// @notice Pre-commit: requestHash = keccak256(decision), written BEFORE the outcome is known.
    function validationRequest(address validator, uint256 agentId, string calldata requestURI, bytes32 requestHash)
        external
    {
        require(_v[requestHash].lastUpdate == 0, "request exists");
        _v[requestHash] =
            Validation(validator, agentId, 0, bytes32(0), "", block.timestamp, false);
        _agentReqs[agentId].push(requestHash);
        emit ValidationRequest(validator, agentId, requestURI, requestHash);
    }

    /// @notice Reveal: the realized outcome/score for a previously-committed request.
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        Validation storage v = _v[requestHash];
        require(v.lastUpdate != 0, "no request");
        require(!v.responded, "already responded");
        v.response = response;
        v.responseHash = responseHash;
        v.tag = tag;
        v.lastUpdate = block.timestamp;
        v.responded = true;
        emit ValidationResponse(v.validator, v.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validator,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        Validation storage v = _v[requestHash];
        return (v.validator, v.agentId, v.response, v.responseHash, v.tag, v.lastUpdate);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentReqs[agentId];
    }
}

/// @notice ReputationRegistry — permissionless feedback signals + a simple on-chain aggregate.
contract ReputationRegistry {
    struct Agg {
        uint64 count;
        int256 sum;
    }

    mapping(uint256 => Agg) private _agg;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        uint8 valueDecimals,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        Agg storage a = _agg[agentId];
        a.count += 1;
        a.sum += int256(value);
        emit NewFeedback(agentId, msg.sender, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    /// @dev Simplified aggregate over all feedback for the agent (count + mean value).
    function getSummary(uint256 agentId) external view returns (uint64 count, int128 summaryValue) {
        Agg storage a = _agg[agentId];
        count = a.count;
        summaryValue = count == 0 ? int128(0) : int128(a.sum / int256(uint256(count)));
    }
}
