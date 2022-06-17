const advanceTime = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds - 1]);
  await network.provider.send("evm_mine");
};

module.exports = { advanceTime };
