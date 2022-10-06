const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getEvmSnapshot, revertEvm } = require("../utils");

const { deployERC20Offering } = require("../../scripts/helpers");
const { BigNumber } = require("ethers");

const poolPurchaseTokenDecimals = [2, 6, 16, 18];

describe("Fungible token sale mint formulas", async () => {
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

  for (const purchaseTokenDecimals of poolPurchaseTokenDecimals) {
    for (const offerTokenDecimals of poolPurchaseTokenDecimals) {
      describe(`PRCH(${purchaseTokenDecimals} decimals), OFFR(${offerTokenDecimals} decimals)`, async () => {
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

        it(".getCurrentMintAmount() should output the expected offer token amount", async () => {
          let offerTokenPrice = await originationPool.getOfferTokenPrice();
          let contribution = offerTokenPrice;
          let mintAmount = await originationPool.getCurrentMintAmount(contribution);

          // contribute with the exact offer token price
          expect(mintAmount).to.be.gt(0);
          expect(mintAmount).to.equal(ethers.utils.parseUnits("1", offerTokenDecimals));

          // contribute with less than the offer token price
          contribution = offerTokenPrice.sub(1);
          await originationPool.getCurrentMintAmount(contribution);
          mintAmount = await originationPool.getCurrentMintAmount(contribution);

          let expectedMintAmount;
          if (purchaseTokenDecimals > offerTokenDecimals) {
            expectedMintAmount = "9".repeat(offerTokenDecimals);
          } else {
            expectedMintAmount = "9".repeat(purchaseTokenDecimals) + "0".repeat(Math.abs(offerTokenDecimals - purchaseTokenDecimals));
          }

          expect(mintAmount).to.be.gt(0);
          expect(mintAmount).to.equal(BigNumber.from(expectedMintAmount));

          // contribute with more than the offer token price
          contribution = offerTokenPrice.add(offerTokenPrice.div(2));
          await originationPool.getCurrentMintAmount(contribution);
          mintAmount = await originationPool.getCurrentMintAmount(contribution);

          expect(mintAmount).to.be.gt(0);
          expect(mintAmount).to.be.equal(ethers.utils.parseUnits("1.5", offerTokenDecimals));
        });

        it(".getPurchaseAmountFromOfferAmount() should output the expected purchase token amount", async () => {
          let offerTokenAmount = ethers.utils.parseUnits("1", offerTokenDecimals);
          let purchaseAmount = await originationPool.getPurchaseAmountFromOfferAmount(offerTokenAmount);

          // purchase amount for exact offer token price
          expect(purchaseAmount).to.be.gt(0);
          expect(purchaseAmount).to.equal(ethers.utils.parseUnits("1", purchaseTokenDecimals));

          // purchase amount for less than the offer token price
          offerTokenAmount = ethers.utils.parseUnits("1", offerTokenDecimals).sub(1);
          purchaseAmount = await originationPool.getPurchaseAmountFromOfferAmount(offerTokenAmount);

          let expectedPurchaseAmount;
          if (purchaseTokenDecimals < offerTokenDecimals) {
            expectedPurchaseAmount = "9".repeat(purchaseTokenDecimals);
          } else {
            expectedPurchaseAmount = "9".repeat(offerTokenDecimals) + "0".repeat(Math.abs(offerTokenDecimals - purchaseTokenDecimals));
          }

          expect(purchaseAmount).to.be.gt(0);
          expect(purchaseAmount).to.equal(BigNumber.from(expectedPurchaseAmount));

          // purchase amount for more than the offer token price
          offerTokenAmount = ethers.utils.parseUnits("1.5", offerTokenDecimals);
          purchaseAmount = await originationPool.getPurchaseAmountFromOfferAmount(offerTokenAmount);

          expect(purchaseAmount).to.be.gt(0);
          expect(purchaseAmount).to.be.equal(ethers.utils.parseUnits("1.5", purchaseTokenDecimals));
        });
      });
    }
  }
});
