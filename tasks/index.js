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

task("addfund", "Add DinoDens to DinoTreasury")
	.addParam("point", "Allocation points assigned to Dens")
	.setAction(async ({ point }, hre) => {
		const treasuryAddress = (await hre.deployments.get("DinoTreasury")).address
		console.log('Treasury Address:', treasuryAddress)
		const treasury = await hre.ethers.getContractAt('DinoTreasury', treasuryAddress)

		const densAddress = (await hre.deployments.get("DinoDens")).address
		console.log('Dens Address:', densAddress)
		const dens = await hre.ethers.getContractAt('DinoDens', densAddress)
		
		await treasury.add(point, dens.address)
	})

task("senddino", "Send DINO to address")
	.addParam("account", "To account address")
	.addParam("amount", "DINO Amount")
	.setAction(async ({ account, amount }, hre) => {
		const dinoAddress = (await hre.deployments.get("DinoToken")).address
		console.log('DINO Address:', dinoAddress)
		const dino = await hre.ethers.getContractAt('DinoToken', dinoAddress)
		await dino.transfer(account, amount)
		console.log(`Transfer ${amount} DINO token to ${account}`)
	})

task("addpool", "Add pool to DinoDens")
	.addParam("point", "Allocation points assigned to Dens")
	.addParam("pool", "Pool address")
	.setAction(async ({ point, pool }, hre) => {
		const densAddress = (await hre.deployments.get("DinoDens")).address
		console.log('Dens Address:', densAddress)
		const dens = await hre.ethers.getContractAt('DinoDens', densAddress)
		await dens.add(point, pool, true)
	})

task("querypool", "Query pool info")
	.addParam("pid", "Pool ID")
	.addOptionalParam("account", "User address", "")
	.setAction(async ({ pid, account }, hre) => {
		const densAddress = (await hre.deployments.get("DinoDens")).address
		console.log('Dens Address:', densAddress)
		const dens = await hre.ethers.getContractAt('DinoDens', densAddress)
		console.log('Pool Info', await dens.poolInfo(pid))
		if (account) {
			console.log(await dens.userInfo(pid, account))
		}
	})