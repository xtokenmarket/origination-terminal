const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const whitelistAddresses = [
  "0x2FaDd5D62911A8d40B10898383602EA57f97Be42",
  "0xfa3caab19e6913b6aabdda4e27ac413e96eab0ca",
  "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511",
  "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f",
];

const leafNodes = whitelistAddresses.map((addr) => keccak256(addr));
const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
const rootHash = merkleTree.getRoot();

console.log("Whitelist root hash:", rootHash);
console.log("Whitelist merkle tree:");
console.log(merkleTree.toString());

console.log("Getting proofs for address:", whitelistAddresses[0]);
const claimingAddress = leafNodes[0];
const hexProof = merkleTree.getHexProof(claimingAddress);

console.log("Proofs for address:", whitelistAddresses[0]);
console.log(hexProof);
