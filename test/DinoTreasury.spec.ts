import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
import { expandTo18Decimals, advanceBlockTo } from './shared/utilities'

describe('DinoTreasury', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets()
    this.minter = this.wallets[0]
    this.recipient = this.wallets[1]
    this.recipient2 = this.wallets[2]

    this.DinoTreasury = await ethers.getContractFactory('DinoTreasury', this.minter)
    this.DinoToken = await ethers.getContractFactory('DinoToken', this.minter)
  })

  beforeEach(async function () {
    this.dino = await this.DinoToken.deploy()
    await this.dino.deployed()

    this.treasury = await this.DinoTreasury.deploy(this.dino.address, 0)
    await this.treasury.deployed()
    await this.dino.transfer(this.treasury.address, expandTo18Decimals(15000))
  })

  it('should set correct state variables', async function () {
    expect(await this.treasury.dino()).to.equal(this.dino.address)
    expect(await this.treasury.startBlock()).to.equal(0)
    expect(await this.dino.balanceOf(this.treasury.address)).to.equal(expandTo18Decimals(15000))
    expect(await this.treasury.dinoRewardAtBlock(0)).to.equal(expandTo18Decimals(6))
    expect(await this.treasury.dinoRewardAtBlock(863_999)).to.equal(expandTo18Decimals(6))
    expect(await this.treasury.nextReductionBlock(10)).to.equal(864_000)
  })

  it('should add new fund', async function () {
    await advanceBlockTo(9)
    await this.treasury.add(100, this.recipient.address)
    expect(await this.treasury.recipientToPid(this.recipient.address)).to.equal(1)
    expect((await this.treasury.fundInfo(1)).recipient).to.equal(this.recipient.address)
    expect((await this.treasury.fundInfo(1)).lastRewardBlock).to.equal(10)
    expect((await this.treasury.fundInfo(1)).allocPoint).to.equal(100)
    expect(await this.treasury.totalAllocPoint()).to.equal(100)

    await advanceBlockTo(19)
    await this.treasury.connect(this.recipient).claim()
    expect(await this.dino.balanceOf(this.recipient.address)).to.equal(expandTo18Decimals(60))
    await this.treasury.connect(this.recipient).claim()
    expect(await this.dino.balanceOf(this.recipient.address)).to.equal(expandTo18Decimals(66))
    expect(await this.dino.balanceOf(this.treasury.address)).to.equal(expandTo18Decimals(15000 - 66))

    await advanceBlockTo(29)
    await this.treasury.add(50, this.recipient2.address)
    expect(await this.treasury.totalAllocPoint()).to.equal(150)

    await advanceBlockTo(39)
    await this.treasury.connect(this.recipient2).claim()
    expect(await this.dino.balanceOf(this.recipient2.address)).to.equal(expandTo18Decimals(20))
    await this.treasury.connect(this.recipient).claim()
    expect(await this.dino.balanceOf(this.recipient.address)).to.equal(expandTo18Decimals(164))
  })
})
