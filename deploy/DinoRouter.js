const WBNB = {
  "56": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  "97": "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()

  const chainId = await getChainId()

  let wbnbAddress;
  if (chainId === "1337") {
    wbnbAddress = (await deployments.get("WBNB")).address
  } else if (chainId in WBNB) {
    wbnbAddress = WBNB[chainId]
  } else {
    throw Error("No WBNB!")
  }

  const factoryAddress = (await deployments.get("DinoFactory")).address

  await deploy("DinoRouter", {
    from: deployer,
    args: [factoryAddress, wbnbAddress],
    log: true,
    deterministicDeployment: false
  })
}

module.exports.tags = ["DinoRouter"]
module.exports.dependencies = ["DinoFactory", "Mocks"]