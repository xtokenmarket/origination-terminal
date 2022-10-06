const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getEvmSnapshot, revertEvm } = require("../utils");

const { deployERC20Offering } = require("../../scripts/helpers");
const { BigNumber } = require("ethers");

const poolTokensDecimals = [8, 12, 18];

describe("Fungible token sale min contribution", async () => {
  let snapshotID;

  before(async () => {
    [deployer, user, user1] = await ethers.getSigners();
  });

  beforeEach(async () => {
    snapshotID = await getEvmSnapshot();
  });

  afterEach(async () => {
    await revertEvm(snapshotID);
  });

  for (const purchaseTokenDecimals of poolTokensDecimals) {
    for (const offerTokenDecimals of poolTokensDecimals) {
      describe(`Min contribution: PRCH(${purchaseTokenDecimals} decimals), OFFR(${offerTokenDecimals} decimals)`, async () => {
        let snapshotID, originationPool;

        before(async () => {
          originationPool = await deployERC20Offering(offerTokenDecimals, purchaseTokenDecimals, "1");
        });

        beforeEach(async () => {
          snapshotID = await getEvmSnapshot();
        });

        afterEach(async () => {
          await revertEvm(snapshotID);
        });

        it("should successfully contribute with min contribution amount", async () => {
          const minContribution = BigNumber.from(10 ** (purchaseTokenDecimals / 2));

          expect(await originationPool.minContributionAmount()).to.equal(minContribution);

          // contribute with less than min contribution
          await expect(originationPool.purchase(minContribution.sub(1))).to.be.revertedWith("Need to contribute at least min contribution amount");

          // contribute with min contribution amount
          let expectedOfferTokenAmount = await originationPool.getCurrentMintAmount(minContribution);
          await originationPool.connect(user).purchase(minContribution);

          if (purchaseTokenDecimals - offerTokenDecimals > purchaseTokenDecimals / 2) {
            // the difference between Purchase Token decimals and Offer Token decimals
            // is too big for the min contribution to produce proper returns in terms of Offer Token

            // we expect a bigger contribution to return at least 1 wei
            // even in this case, the gas fees are way bigger than the returned amount
            expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(0);
            const amountIn = minContribution.mul(10 ** (purchaseTokenDecimals - offerTokenDecimals - purchaseTokenDecimals / 2));
            expect(await originationPool.getCurrentMintAmount(amountIn)).to.equal(1);

            console.log("\nMin contribution of", ethers.utils.formatUnits(minContribution, purchaseTokenDecimals), "PRCH mints 0 OFFR");
            console.log("Contribution of", ethers.utils.formatUnits(amountIn, purchaseTokenDecimals), "PRCH mints 1 weiOFFR\n");
            return;
          }

          expect(await originationPool.offerTokenAmountPurchased(user.address)).to.equal(expectedOfferTokenAmount);
        });

        it("should correctly collect the correct fees in purchase token", async () => {
          const minContribution = BigNumber.from(10 ** (purchaseTokenDecimals / 2));
          const originationFee = await originationPool.originationFee();

          expect(originationFee).to.equal(ethers.utils.parseUnits("1", 16));
          expect(await originationPool.minContributionAmount()).to.equal(minContribution);
          expect(await originationPool.originationCoreFees()).to.equal(0);

          const expectedPuruchaseFee = minContribution.mul(originationFee).div(ethers.utils.parseEther("1"));

          expect(expectedPuruchaseFee).to.be.gt(0);
          await originationPool.connect(user).purchase(minContribution);
          expect(await originationPool.originationCoreFees()).to.equal(expectedPuruchaseFee);
        });
      });
    }
  }
});
