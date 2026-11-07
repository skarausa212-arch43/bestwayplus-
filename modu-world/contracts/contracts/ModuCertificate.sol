// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MODU Certificate (TESTNET ONLY)
 * @notice ERC-721 certificate of authenticity for a physical MODU collectible.
 *         Stores only the public serial number. Never stores personal data or school data.
 *         Token ids are assigned by the MODU backend (one per physical toy).
 */
contract ModuCertificate is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string private _base;
    mapping(uint256 tokenId => string) private _serials;
    mapping(bytes32 serialHash => bool) public serialUsed;

    event CertificateIssued(uint256 indexed tokenId, address indexed to, string serial);

    error SerialAlreadyCertified(string serial);

    constructor(address admin, string memory baseURI_) ERC721("MODU Certificate (testnet)", "MODUCERT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _base = baseURI_;
    }

    function safeMint(address to, uint256 tokenId, string calldata serial) external onlyRole(MINTER_ROLE) {
        bytes32 h = keccak256(bytes(serial));
        if (serialUsed[h]) revert SerialAlreadyCertified(serial);
        serialUsed[h] = true;
        _serials[tokenId] = serial;
        _safeMint(to, tokenId);
        emit CertificateIssued(tokenId, to, serial);
    }

    function serialOf(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _serials[tokenId];
    }

    function setBaseURI(string calldata baseURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _base = baseURI_;
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
