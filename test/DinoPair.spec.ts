import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { expandTo18Decimals, advanceBlock } from './shared/utilities'

const DECIMALS = '000000000000000000'
const TOTAL_SUPPLY = BigNumber.from('10000' + DECIMALS)
const MINIMUM_LIQUIDITY = BigNumber.from(1000)

describe('DinoPair', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets()
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
    await this.factory.deployed()

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
    this.pair = await ethers.getContractAt('DinoPair', pairAddress, this.minter)

    const token0Address = await this.pair.token0()
    this.token0 = tokenA.address === token0Address ? tokenA : tokenB
    this.token1 = tokenA.address === token0Address ? tokenB : tokenA

    this.addLiquidity = async function (token0Amount: BigNumber, token1Amount: BigNumber) {
      await this.token0.transfer(this.pair.address, token0Amount)
      await this.token1.transfer(this.pair.address, token1Amount)
      await this.pair.mint(this.minter.address)
    }
  })

  it('mint', async function () {
    const token0Amount = '1' + DECIMALS
    const token1Amount = '4' + DECIMALS
    await this.token0.transfer(this.pair.address, token0Amount)
    await this.token1.transfer(this.pair.address, token1Amount)

    const expectedLiquidity = BigNumber.from('2' + DECIMALS)
    await expect(this.pair.mint(this.minter.address))
      .to.emit(this.pair, 'Transfer')
      .withArgs(ethers.constants.AddressZero, ethers.constants.AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(this.pair, 'Transfer')
      .withArgs(ethers.constants.AddressZero, this.minter.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(this.pair, 'Sync')
      .withArgs(token0Amount, token1Amount)
      .to.emit(this.pair, 'Mint')
      .withArgs(this.minter.address, token0Amount, token1Amount)

    expect(await this.pair.totalSupply()).to.eq(expectedLiquidity)
    expect(await this.pair.balanceOf(this.minter.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await this.token0.balanceOf(this.pair.address)).to.eq(token0Amount)
    expect(await this.token1.balanceOf(this.pair.address)).to.eq(token1Amount)
    const reserves = await this.pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount)
    expect(reserves[1]).to.eq(token1Amount)
  })

  const swapTestCases: BigNumber[][] = [
    [1, 5, 10, '1663887962654218072'],
    [1, 10, 5, '453718857974177123'],
    [2, 5, 10, '2853058890794739851'],
    [2, 10, 5, '831943981327109036'],
    [1, 10, 10, '907437715948354246'],
    [1, 100, 100, '988138378977801540'],
    [1, 1000, 1000, '997004989020957084'],
  ].map((a) => a.map((n) => (typeof n === 'string' ? BigNumber.from(n) : BigNumber.from(n + DECIMALS))))

  swapTestCases.forEach((swapTestCase, i) => {
    it(`getInputPrice:${i}`, async function () {
      const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
      await this.addLiquidity(token0Amount, token1Amount)
      await this.token0.transfer(this.pair.address, swapAmount)
      await expect(this.pair.swap(0, expectedOutputAmount.add(1), this.minter.address, '0x')).to.be.revertedWith(
        'Dino: K'
      )
      await this.pair.swap(0, expectedOutputAmount, this.minter.address, '0x')
    })
  })

  const optimisticTestCases: BigNumber[][] = [
    ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .998)
    ['997000000000000000', 10, 5, 1],
    ['997000000000000000', 5, 5, 1],
    [1, 5, 5, '1002004008016032065'], // given amountOut, amountIn = ceiling(amountOut / .998)
  ].map((a) => a.map((n) => (typeof n === 'string' ? BigNumber.from(n) : BigNumber.from(n + DECIMALS))))

  optimisticTestCases.forEach((optimisticTestCase, i) => {
    it(`optimistic:${i}`, async function () {
      const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
      await this.addLiquidity(token0Amount, token1Amount)
      await this.token0.transfer(this.pair.address, inputAmount)
      await expect(this.pair.swap(outputAmount.add(1), 0, this.minter.address, '0x')).to.be.revertedWith('Dino: K')
      await this.pair.swap(outputAmount, 0, this.minter.address, '0x')
    })
  })

  it('swap:token0', async function () {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await this.addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = BigNumber.from('1662497915624478906')
    await this.token0.transfer(this.pair.address, swapAmount)
    await expect(this.pair.swap(0, expectedOutputAmount, this.minter.address, '0x'))
      .to.emit(this.token1, 'Transfer')
      .withArgs(this.pair.address, this.minter.address, expectedOutputAmount)
      .to.emit(this.pair, 'Sync')
      .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
      .to.emit(this.pair, 'Swap')
      .withArgs(this.minter.address, swapAmount, 0, 0, expectedOutputAmount, this.minter.address)

    const reserves = await this.pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
    expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
    expect(await this.token0.balanceOf(this.pair.address)).to.eq(token0Amount.add(swapAmount))
    expect(await this.token1.balanceOf(this.pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
    const totalSupplyToken0 = await this.token0.totalSupply()
    const totalSupplyToken1 = await this.token1.totalSupply()
    expect(await this.token0.balanceOf(this.minter.address)).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
    expect(await this.token1.balanceOf(this.minter.address)).to.eq(
      totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount)
    )
  })

  // it('swap:token1', async () => {
  //   const token0Amount = expandTo18Decimals(5)
  //   const token1Amount = expandTo18Decimals(10)
  //   await addLiquidity(token0Amount, token1Amount)

  //   const swapAmount = expandTo18Decimals(1)
  //   const expectedOutputAmount = bigNumberify('453305446940074565')
  //   await token1.transfer(pair.address, swapAmount)
  //   await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides))
  //     .to.emit(token0, 'Transfer')
  //     .withArgs(pair.address, wallet.address, expectedOutputAmount)
  //     .to.emit(pair, 'Sync')
  //     .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
  //     .to.emit(pair, 'Swap')
  //     .withArgs(wallet.address, 0, swapAmount, expectedOutputAmount, 0, wallet.address)

  //   const reserves = await pair.getReserves()
  //   expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
  //   expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
  //   expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
  //   expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
  //   const totalSupplyToken0 = await token0.totalSupply()
  //   const totalSupplyToken1 = await token1.totalSupply()
  //   expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount))
  //   expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount))
  // })

  it('swap:gas', async function () {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await this.addLiquidity(token0Amount, token1Amount)

    // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    await advanceBlock()
    await this.pair.sync()

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = BigNumber.from('453305446940074565')
    await this.token1.transfer(this.pair.address, swapAmount)
    await advanceBlock()
    const tx = await this.pair.swap(expectedOutputAmount, 0, this.minter.address, '0x')
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(151415)
  })

  // it('burn', async () => {
  //   const token0Amount = expandTo18Decimals(3)
  //   const token1Amount = expandTo18Decimals(3)
  //   await addLiquidity(token0Amount, token1Amount)

  //   const expectedLiquidity = expandTo18Decimals(3)
  //   await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //   await expect(pair.burn(wallet.address, overrides))
  //     .to.emit(pair, 'Transfer')
  //     .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //     .to.emit(token0, 'Transfer')
  //     .withArgs(pair.address, wallet.address, token0Amount.sub(1000))
  //     .to.emit(token1, 'Transfer')
  //     .withArgs(pair.address, wallet.address, token1Amount.sub(1000))
  //     .to.emit(pair, 'Sync')
  //     .withArgs(1000, 1000)
  //     .to.emit(pair, 'Burn')
  //     .withArgs(wallet.address, token0Amount.sub(1000), token1Amount.sub(1000), wallet.address)

  //   expect(await pair.balanceOf(wallet.address)).to.eq(0)
  //   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
  //   expect(await token0.balanceOf(pair.address)).to.eq(1000)
  //   expect(await token1.balanceOf(pair.address)).to.eq(1000)
  //   const totalSupplyToken0 = await token0.totalSupply()
  //   const totalSupplyToken1 = await token1.totalSupply()
  //   expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(1000))
  //   expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(1000))
  // })

  // it('price{0,1}CumulativeLast', async () => {
  //   const token0Amount = expandTo18Decimals(3)
  //   const token1Amount = expandTo18Decimals(3)
  //   await addLiquidity(token0Amount, token1Amount)

  //   const blockTimestamp = (await pair.getReserves())[2]
  //   await mineBlock(provider, blockTimestamp + 1)
  //   await pair.sync(overrides)

  //   const initialPrice = encodePrice(token0Amount, token1Amount)
  //   expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
  //   expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
  //   expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1)

  //   const swapAmount = expandTo18Decimals(3)
  //   await token0.transfer(pair.address, swapAmount)
  //   await mineBlock(provider, blockTimestamp + 10)
  //   // swap to a new price eagerly instead of syncing
  //   await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x', overrides) // make the price nice

  //   expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10))
  //   expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
  //   expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

  //   await mineBlock(provider, blockTimestamp + 20)
  //   await pair.sync(overrides)

  //   const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
  //   expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
  //   expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
  //   expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
  // })

  // it('feeTo:off', async () => {
  //   const token0Amount = expandTo18Decimals(1000)
  //   const token1Amount = expandTo18Decimals(1000)
  //   await addLiquidity(token0Amount, token1Amount)

  //   const swapAmount = expandTo18Decimals(1)
  //   const expectedOutputAmount = bigNumberify('996006981039903216')
  //   await token1.transfer(pair.address, swapAmount)
  //   await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)

  //   const expectedLiquidity = expandTo18Decimals(1000)
  //   await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //   await pair.burn(wallet.address, overrides)
  //   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
  // })

  // it('feeTo:on', async () => {
  //   await factory.setFeeTo(other.address)

  //   const token0Amount = expandTo18Decimals(1000)
  //   const token1Amount = expandTo18Decimals(1000)
  //   await addLiquidity(token0Amount, token1Amount)

  //   const swapAmount = expandTo18Decimals(1)
  //   const expectedOutputAmount = bigNumberify('996006981039903216')
  //   await token1.transfer(pair.address, swapAmount)
  //   await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)

  //   const expectedLiquidity = expandTo18Decimals(1000)
  //   await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //   await pair.burn(wallet.address, overrides)
  //   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add('374625795658571'))
  //   expect(await pair.balanceOf(other.address)).to.eq('374625795658571')

  //   // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
  //   // ...because the initial liquidity amounts were equal
  //   expect(await token0.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('374252525546167'))
  //   expect(await token1.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('375000280969452'))
  // })
})
