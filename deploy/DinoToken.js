module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()

  await deploy("DinoToken", {
    from: deployer,
    log: true,
  })
}

module.exports.skip = ({ getChainId }) =>
  new Promise(async (resolve, reject) => {
    try {
      const chainId = await getChainId()
      resolve(chainId !== "97")
    } catch (error) {
      reject(error)
    }
  })

module.exports.tags = ["DinoToken"]