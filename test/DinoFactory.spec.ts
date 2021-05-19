import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]

function getCreate2Address(factoryAddress: string, [tokenA, tokenB]: [string, string], bytecode: string): string {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    utils.keccak256(utils.solidityPack(['address', 'address'], [token0, token1])),
    utils.keccak256(bytecode),
  ]
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`)
}

describe('DinoFactory', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets()
    this.alice = this.wallets[0]
    this.minter = this.wallets[1]

    this.DinoFactory = await ethers.getContractFactory('DinoFactory')
    this.DinoPair = await ethers.getContractFactory('DinoPair')
  })

  beforeEach(async function () {
    this.factory = await this.DinoFactory.deploy(this.minter.address)
    await this.factory.deployed()
  })

  it('feeTo, feeToSetter, allPairsLength', async function () {
    expect(await this.factory.feeTo()).to.eq(ethers.constants.AddressZero)
    expect(await this.factory.feeToSetter()).to.eq(this.minter.address)
    expect(await this.factory.allPairsLength()).to.eq(0)
  })

  it('createPair', async function () {
    const bytecode = this.DinoPair.bytecode
    const create2Address = getCreate2Address(this.factory.address, TEST_ADDRESSES, bytecode)
    await expect(this.factory.createPair(...TEST_ADDRESSES))
      .to.emit(this.factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, BigNumber.from(1))

    await expect(this.factory.createPair(...TEST_ADDRESSES)).to.be.reverted // Dino: PAIR_EXISTS
    await expect(this.factory.createPair(...TEST_ADDRESSES.slice().reverse())).to.be.reverted // Dino: PAIR_EXISTS
    expect(await this.factory.getPair(...TEST_ADDRESSES)).to.eq(create2Address)
    expect(await this.factory.getPair(...TEST_ADDRESSES.slice().reverse())).to.eq(create2Address)
    expect(await this.factory.allPairs(0)).to.eq(create2Address)
    expect(await this.factory.allPairsLength()).to.eq(1)

    const pair = await ethers.getContractAt('DinoPair', create2Address)
    expect(await pair.factory()).to.eq(this.factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  })

  it('createPair:gas', async function () {
    const tx = await this.factory.createPair(...TEST_ADDRESSES)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(1999528)
  })

  it('setFeeTo', async function () {
    await expect(this.factory.connect(this.alice).setFeeTo(this.alice.address)).to.be.revertedWith('Dino: FORBIDDEN')
    await this.factory.connect(this.minter).setFeeTo(this.alice.address)
    expect(await this.factory.feeTo()).to.eq(this.alice.address)
  })

  it('setFeeToSetter', async function () {
    await expect(this.factory.connect(this.alice).setFeeToSetter(this.alice.address)).to.be.revertedWith(
      'Dino: FORBIDDEN'
    )
    await this.factory.connect(this.minter).setFeeToSetter(this.alice.address)
    expect(await this.factory.feeToSetter()).to.eq(this.alice.address)
    await expect(this.factory.connect(this.minter).setFeeToSetter(this.minter.address)).to.be.revertedWith(
      'Dino: FORBIDDEN'
    )
  })
})
