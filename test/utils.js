const advanceTime = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds]);
};

module.exports = { advanceTime };
