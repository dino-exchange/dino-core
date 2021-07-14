const ORACLE = {
  "56": "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
  "97": "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
};

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer, admin, operator } = await getNamedAccounts()

  const chainId = await getChainId()

  let oracleAddress;
  if (chainId in ORACLE) {
    oracleAddress = ORACLE[chainId]
  } else {
    throw Error("No ORACLE!")
  }

  await deploy('BnbPricePrediction', {
    from: deployer,
    args: [oracleAddress, deployer, deployer, 100, 50, 1e15, 300],
    log: true,
    deterministicDeployment: false,
  })
}

module.exports.tags = ["PricePrediction"]