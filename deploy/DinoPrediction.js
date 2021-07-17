const DinoToken = {
  "56": "0xf317932ee2C30fa5d0E14416775977801734812D",
};

const ORACLE = {
  "56": "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
  "97": "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
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

  let oracleAddress;
  if (chainId in ORACLE) {
    oracleAddress = ORACLE[chainId]
  } else {
    throw Error("No ORACLE!")
  }

  await deploy('DinoPrediction', {
    from: deployer,
    args: [dinoTokenAddress, oracleAddress, deployer, deployer, 100, 50, 1e15, 300],
    log: true,
    deterministicDeployment: false,
  })
}

module.exports.tags = ["DinoPrediction"]
module.exports.dependencies = ["Mocks", "DinoToken"]