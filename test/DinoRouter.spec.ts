import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

const DECIMALS = '000000000000000000'
const TOTAL_SUPPLY = BigNumber.from('10000' + DECIMALS)

describe('DinoRouter', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets();
    this.alice = this.wallets[0]
    this.minter = this.wallets[1]
    this.dev = this.wallets[2]
    
    this.DinoFactory = await ethers.getContractFactory('DinoFactory', this.minter)
    this.DinoRouter = await ethers.getContractFactory('DinoRouter', this.minter)
    this.MockBEP20 = await ethers.getContractFactory('MockBEP20', this.minter)
    this.WBNB = await ethers.getContractFactory('WBNB', this.minter)
  })

  beforeEach(async function () {
    this.factory = await this.DinoFactory.deploy(this.dev.address)
    await this.factory.deployed();

    let tokenA = await this.MockBEP20.deploy(TOTAL_SUPPLY)
    await tokenA.deployed()

    const tokenB = await this.MockBEP20.deploy(TOTAL_SUPPLY)
    await tokenB.deployed()

    const tokenWBNB = await this.WBNB.deploy()
    await tokenWBNB.deployed()

    this.router = await this.DinoRouter.deploy(this.factory.address, tokenWBNB.address)
    await this.router.deployed()
  
    await this.factory.createPair(tokenA.address, tokenB.address)
    const pairAddress = await this.factory.getPair(tokenA.address, tokenB.address)
    const pair = await ethers.getContractAt('DinoPair', pairAddress)
  
    const token0Address = (await pair.token0()).address
    this.token0 = tokenA.address === token0Address ? tokenA : tokenB
    this.token1 = tokenA.address === token0Address ? tokenB : tokenA
  })

  it('getAmountsOut', async function() {
    await this.token0.approve(this.router.address, ethers.constants.MaxUint256)
    await this.token1.approve(this.router.address, ethers.constants.MaxUint256)
    await this.router.addLiquidity(
      this.token0.address,
      this.token1.address,
      BigNumber.from(10000),
      BigNumber.from(10000),
      0,
      0,
      this.minter.address,
      ethers.constants.MaxUint256
    )

    await expect(this.router.getAmountsOut(BigNumber.from(2), [this.token0.address])).to.be.revertedWith(
      'DinoLibrary: INVALID_PATH'
    )
    const path = [this.token0.address, this.token1.address]
    expect(await this.router.getAmountsOut(BigNumber.from(2), path)).to.deep.eq([BigNumber.from(2), BigNumber.from(1)])
  })
})
