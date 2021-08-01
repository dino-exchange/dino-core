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

task("adddensfund", "Add DinoDens to DinoTreasury")
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

task("addvaultfund", "Add DinoVault to DinoTreasury")
	.setAction(async (_args, hre) => {
		const treasuryAddress = (await hre.deployments.get("DinoTreasury")).address
		console.log('Treasury Address:', treasuryAddress)
		const treasury = await hre.ethers.getContractAt('DinoTreasury', treasuryAddress)

		const vaultAddress = (await hre.deployments.get("DinoVault")).address
		console.log('Vault Address:', vaultAddress)
		const vault = await hre.ethers.getContractAt('DinoVault', vaultAddress)

		await treasury.set(0, 55)
		await treasury.set(1, 3)
		await treasury.add(2, vault.address)
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const waitForRound = async (pp) => {
	while (true) {
		console.log('wait for round')
		await sleep(5000)
		try { if (await pp.shouldExecuteRound()) return; } catch (err) { }
	}
}
const genesisround = async (pp) => {
	console.log('genesisStartRound')
	try { await pp.genesisStartRound() } catch (err) {
		console.log('genesisStartRound error', err)
	}
	console.log('waiting for genesis round')
	await waitForRound(pp);
	console.log('genesisLockRound')
	try { await pp.genesisLockRound() } catch (err) {
		console.log('genesisLockRound error', err)
	}
}
const resetprediction = async (pp) => {
	console.log('pause')
	try { await pp.pause() } catch (err) {
		console.log('pause error', err)
	}
	await sleep(10000)
	console.log('unpause')
	try { await pp.unpause() } catch (err) {
		console.log('unpause error', err)
	}
	await sleep(10000)
}
const executeround = async (pp) => {
	console.log("waiting for current round")
	await waitForRound(pp);
	console.log('executeRound')
	try {
		await pp.executeRound()
	} catch (err) {
		if (err.error && err.error.message &&
			(err.error.message.includes("Can only") || err.error.message.includes("Pausable"))) {
			await resetprediction(pp)
			await genesisround(pp)
		} else {
			throw err
		}
	}
}

task("genesisround", "Run PricePrediction genesis round")
	.setAction(async (_args, hre) => {
		const ppAddress = (await hre.deployments.get("DinoPrediction")).address
		console.log('Prediction Address:', ppAddress)
		const pp = await hre.ethers.getContractAt('DinoPrediction', ppAddress)
		await genesisround(pp)
	})

task("updateinterval", "Update PricePrediction interval")
	.addParam("block", "new interval block")
	.setAction(async ({ block }, hre) => {
		const ppAddress = (await hre.deployments.get("DinoPrediction")).address
		console.log('Prediction Address:', ppAddress)
		const pp = await hre.ethers.getContractAt('DinoPrediction', ppAddress)
		await pp.setIntervalBlocks(block)
	})

task("resetprediction", "Reset PricePrediction")
	.setAction(async (_args, hre) => {
		const ppAddress = (await hre.deployments.get("DinoPrediction")).address
		console.log('Prediction Address:', ppAddress)
		const pp = await hre.ethers.getContractAt('DinoPrediction', ppAddress)
		await resetprediction(pp)
		await genesisround(pp)
	})

task("executeround", "Execute PricePrediction current round")
	.setAction(async (_args, hre) => {
		const ppAddress = (await hre.deployments.get("DinoPrediction")).address
		console.log('Prediction Address:', ppAddress)
		const pp = await hre.ethers.getContractAt('DinoPrediction', ppAddress)

		while (true) {
			await executeround(pp)
		}
	})