module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    await deploy("WBNB", {
        from: deployer,
        log: true,
    })

    await deploy("DinoToken", {
        from: deployer,
        log: true,
    })
}

module.exports.skip = ({ getChainId }) =>
    new Promise(async (resolve, reject) => {
        try {
            const chainId = await getChainId()
            resolve(chainId !== "1337")
        } catch (error) {
            reject(error)
        }
    })

module.exports.tags = ["Mocks"]