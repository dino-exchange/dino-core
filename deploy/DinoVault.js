const DinoToken = {
  "56": "0xf317932ee2C30fa5d0E14416775977801734812D",
};

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer, feeTo } = await getNamedAccounts()

  const chainId = await getChainId()

  let dinoTokenAddress;
  if (chainId === "1337") {
    dinoTokenAddress = (await deployments.get("DinoToken")).address
  } else if (chainId === "97") {
    dinoTokenAddress = (await deployments.get("DinoToken")).address
  } else if (chainId in DinoToken) {
    dinoTokenAddress = DinoToken[chainId]
  } else {
    throw Error("No DinoToken!")
  }

  const treasuryAddress = (await deployments.get("DinoTreasury")).address
  const startBlock = chainId === "97" ? 9025730 : 7916660
  const feeToAddress = chainId === "56" ? "0x29e87ebae96960768153ff33610420fe5f94d6df" : feeTo

  await deploy('DinoVault', {
    from: deployer,
    args: [dinoTokenAddress, treasuryAddress, startBlock, feeToAddress],
    log: true,
    deterministicDeployment: false,
  })
}

module.exports.tags = ["DinoVault"]
module.exports.dependencies = ["Mocks", "DinoToken", "DinoTreasury"]
