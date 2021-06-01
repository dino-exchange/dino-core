import { ethers } from 'hardhat'
import { expect } from 'chai'
import { expandTo18Decimals, advanceBlockTo } from './shared/utilities'

describe('DinoDens', function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.minter = this.signers[4]

    this.DinoDens = await ethers.getContractFactory('DinoDens')
    this.MockBEP20 = await ethers.getContractFactory('MockBEP20', this.minter)
    this.DinoToken = await ethers.getContractFactory('DinoToken', this.minter)
    this.DinoTreasury = await ethers.getContractFactory('DinoTreasury', this.minter)
  })

  beforeEach(async function () {
    this.dino = await this.DinoToken.deploy()
    await this.dino.deployed()

    this.treasury = await this.DinoTreasury.deploy(this.dino.address, 0)
    await this.treasury.deployed()
    await this.dino.transfer(this.treasury.address, expandTo18Decimals(15000))
  })

  it('should set correct state variables', async function () {
    this.dens = await this.DinoDens.deploy(this.dino.address, this.treasury.address, 1)
    await this.dens.deployed()
    await this.treasury.add('100', this.dens.address)

    expect(await this.dens.dino()).to.equal(this.dino.address)
    expect(await this.dens.treasury()).to.equal(this.treasury.address)
    expect(await this.dino.balanceOf(this.dens.address)).to.equal('0')
  })

  context('With BEP/LP token added to the field', function () {
    beforeEach(async function () {
      this.lp = await this.MockBEP20.deploy('10000000000')
      await this.lp.transfer(this.alice.address, '1000')
      await this.lp.transfer(this.bob.address, '1000')
      await this.lp.transfer(this.carol.address, '1000')

      this.lp2 = await this.MockBEP20.deploy('10000000000')
      await this.lp2.transfer(this.alice.address, '1000')
      await this.lp2.transfer(this.bob.address, '1000')
      await this.lp2.transfer(this.carol.address, '1000')
    })

    it('should allow emergency withdraw', async function () {
      this.dens = await this.DinoDens.deploy(this.dino.address, this.treasury.address, 1)
      await this.dens.deployed()
      await this.dens.add('100', this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.dens.address, '1000')
      await this.dens.connect(this.bob).deposit(1, '100')
      expect(await this.lp.balanceOf(this.bob.address)).to.equal('900')

      await this.dens.connect(this.bob).emergencyWithdraw(1)
      expect(await this.lp.balanceOf(this.bob.address)).to.equal('1000')
    })

    it('should give out DINOs only after farming time', async function () {
      const firstBlock = await ethers.provider.getBlockNumber()
      this.dens = await this.DinoDens.deploy(
        this.dino.address,
        this.treasury.address,
        firstBlock + 100
      )
      await this.dens.deployed()
      await this.treasury.add('100', this.dens.address)
      await this.dens.add('99', this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.dens.address, '1000')
      await this.dens.connect(this.bob).deposit(1, '100')
      await advanceBlockTo(firstBlock + 89)

      await this.dens.connect(this.bob).deposit(1, '0') // block 90
      expect(await this.dino.balanceOf(this.bob.address)).to.equal('0')
      await advanceBlockTo(firstBlock + 94)

      await this.dens.connect(this.bob).deposit(1, '0') // block 95
      expect(await this.dino.balanceOf(this.bob.address)).to.equal('0')
      await advanceBlockTo(firstBlock + 99)

      await this.dens.connect(this.bob).deposit(1, '0') // block 100
      expect(await this.dino.balanceOf(this.bob.address)).to.equal('0')
      await advanceBlockTo(firstBlock + 100)

      await this.dens.connect(this.bob).deposit(1, '0') // block 101
      expect(await this.dino.balanceOf(this.bob.address)).to.equal(expandTo18Decimals(6).mul(9800).div(10000))

      await advanceBlockTo(firstBlock + 104)
      await this.dens.connect(this.bob).deposit(1, '0') // block 105

      expect(await this.dino.balanceOf(this.bob.address)).to.equal(expandTo18Decimals(30).mul(9800).div(10000))
    })

    it('should give out DINOs to the referrer', async function () {
      const firstBlock = await ethers.provider.getBlockNumber()
      this.dens = await this.DinoDens.deploy(
        this.dino.address,
        this.treasury.address,
        firstBlock + 100
      )
      await this.dens.deployed()
      await this.treasury.add('100', this.dens.address)
      await this.dens.add('99', this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.dens.address, '1000')
      await this.dens.connect(this.bob).depositWithReferrer(1, '100', this.carol.address)
      await advanceBlockTo(firstBlock + 100)

      await this.dens.connect(this.bob).deposit(1, '0') // block 101
      expect(await this.dino.balanceOf(this.bob.address)).to.equal(expandTo18Decimals(6).mul(9800).div(10000))
      expect(await this.dino.balanceOf(this.carol.address)).to.equal(expandTo18Decimals(6).mul(200).div(10000))

      await advanceBlockTo(firstBlock + 104)
      await this.dens.connect(this.bob).deposit(1, '0') // block 105

      expect(await this.dino.balanceOf(this.bob.address)).to.equal(expandTo18Decimals(30).mul(9800).div(10000))
      expect(await this.dino.balanceOf(this.carol.address)).to.equal(expandTo18Decimals(30).mul(200).div(10000))
    })
  })
})
