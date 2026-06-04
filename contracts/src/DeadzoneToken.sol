// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title DeadzoneToken
 * @notice ERC-20 with EIP-3009 (transfer/receive/cancel-with-authorization) so payments
 *         can be signed OFFLINE and submitted later by any relayer/courier that pays the gas.
 *         This is the value layer DEADZONE carries across the Bluetooth mesh and settles on Mantle.
 * @dev    Adapted and hardened from NONET's AuthAndMintToken.sol. Adds receiveWithAuthorization
 *         (front-running-safe) and cancelAuthorization, and exposes authorizationState().
 */
contract DeadzoneToken is ERC20, Ownable, EIP712 {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using ECDSA for bytes32;

    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // authorizer => nonce => used
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    constructor(string memory name_, string memory symbol_, uint256 initialSupply_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
        EIP712(name_, "1")
    {
        _mint(msg.sender, initialSupply_);
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    /// @notice Settle a payment signed offline by `from`. Any address (the courier) may submit and pays gas.
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        _requireValidAuthorization(from, nonce, validAfter, validBefore);
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _verify(from, structHash, signature);
        _markUsed(from, nonce);
        _transfer(from, to, value);
    }

    /// @notice Like transferWithAuthorization but only the intended payee (msg.sender == to) can submit.
    ///         Front-running-safe variant; useful when the courier IS the recipient.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        require(to == msg.sender, "Deadzone: caller must be payee");
        _requireValidAuthorization(from, nonce, validAfter, validBefore);
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _verify(from, structHash, signature);
        _markUsed(from, nonce);
        _transfer(from, to, value);
    }

    /// @notice Cancel an unused authorization (e.g. a payment that never made it through the mesh).
    function cancelAuthorization(address authorizer, bytes32 nonce, bytes calldata signature) external {
        require(!_authorizationStates[authorizer][nonce], "Deadzone: nonce already used");
        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        _verify(authorizer, structHash, signature);
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    /// @notice Owner faucet for the demo.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // --- internals ---

    function _requireValidAuthorization(address from, bytes32 nonce, uint256 validAfter, uint256 validBefore)
        private
        view
    {
        require(block.timestamp > validAfter, "Deadzone: auth not yet valid");
        require(block.timestamp < validBefore, "Deadzone: auth expired");
        require(!_authorizationStates[from][nonce], "Deadzone: nonce used");
    }

    function _verify(address signer, bytes32 structHash, bytes calldata signature) private view {
        address recovered = _hashTypedDataV4(structHash).recover(signature);
        require(recovered == signer, "Deadzone: signature mismatch");
    }

    function _markUsed(address from, bytes32 nonce) private {
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
    }
}
