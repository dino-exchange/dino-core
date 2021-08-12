const DinoToken = {
  "56": "0xf317932ee2C30fa5d0E14416775977801734812D",
};

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()

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

  await deploy('DinoLuckyWheel', {
    from: deployer,
    args: [dinoTokenAddress],
    log: true,
    deterministicDeployment: false,
  })
}

module.exports.tags = ["DinoLuckyWheel"]
module.exports.dependencies = ["Mocks", "DinoToken"]
