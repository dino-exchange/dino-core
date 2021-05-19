const DinoToken = {
    "56": "0xf317932ee2C30fa5d0E14416775977801734812D",
};

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer, dev } = await getNamedAccounts()

    const chainId = await getChainId()

    let dinoTokenAddress;
    if (chainId === "1337") {
        dinoTokenAddress = (await deployments.get("DinoToken")).address
    } else if (chainId in DinoToken) {
        dinoTokenAddress = DinoToken[chainId].address
    } else {
        throw Error("No DinoToken!")
    }

    await deploy("DinoDens", {
        from: deployer,
        args: [dinoTokenAddress, dev, 6, 1],
        log: true,
        deterministicDeployment: false
    })
}

module.exports.tags = ["DinoDens"]
module.exports.dependencies = ["Mocks"]