const DinoToken = {
  "56": "0xf317932ee2C30fa5d0E14416775977801734812D",
};

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer, admin, treasury } = await getNamedAccounts()

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

  const densAddress = (await deployments.get("DinoDens")).address

  await deploy('DinoVault', {
    from: deployer,
    args: [dinoTokenAddress, densAddress, admin, treasury],
    log: true,
    deterministicDeployment: false,
  })
}

module.exports.tags = ["DinoVault"]
module.exports.dependencies = ["Mocks", "DinoToken", "DinoDens"]
