const { task } = require("hardhat/config")

task('accounts', 'Prints the list of accounts', async (_args, hre) => {
	const accounts = await hre.ethers.getSigners();
	for (const account of accounts) {
		console.log(account.address);
	}
});

task("initcode", "Prints factory init code pair hash")
	.setAction(async (_args, hre) => {
		const factoryAddress = (await hre.deployments.get("DinoFactory")).address
		console.log('Factory Address:', factoryAddress)
		const factory = await hre.ethers.getContractAt('DinoFactory', factoryAddress)
		console.log('INIT_CODE_PAIR_HASH:', await factory.INIT_CODE_PAIR_HASH())
	})