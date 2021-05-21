const DinoToken = {
  "56": "0xf317932ee2C30fa5d0E14416775977801734812D",
};

module.exports = async function ({ getNamedAccounts, deployments, ethers }) {
  const { deploy } = deployments

  const { deployer, dev } = await getNamedAccounts()

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
  const startBlock = 9025730;

  const dens = await deploy("DinoDens", {
    from: deployer,
    args: [dinoTokenAddress, treasuryAddress, dev, startBlock],
    log: true,
    deterministicDeployment: false
  })

  const treasury = await ethers.getContractAt('DinoTreasury', treasuryAddress)
  await treasury.add(100, dens.address)
}

module.exports.tags = ["DinoDens"]
module.exports.dependencies = ["Mocks", "DinoTreasury", "DinoToken"]