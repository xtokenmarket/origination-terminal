const advanceTime = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds - 1]);
  await network.provider.send("evm_mine");
};

const getEvmSnapshot = async () => {
  return await hre.network.provider.send("evm_snapshot");
};

const revertEvm = async (snapshotID) => {
  await hre.network.provider.send("evm_revert", [snapshotID]);
};

const getCurrentTimestamp = async () => {
  const currentBlockNumber = await ethers.provider.getBlockNumber();
  return (await ethers.provider.getBlock(currentBlockNumber)).timestamp;
};

module.exports = { advanceTime, getCurrentTimestamp, getEvmSnapshot, revertEvm };
