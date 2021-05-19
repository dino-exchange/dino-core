import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract, utils } from 'ethers'
import { ecsign } from 'ethereumjs-util'

const DECIMALS = '000000000000000000'
const TOTAL_SUPPLY = BigNumber.from('10000' + DECIMALS)
const TEST_AMOUNT = BigNumber.from('10' + DECIMALS)

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

function getDomainSeparator(name: string, tokenAddress: string) {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        utils.keccak256(
          utils.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
        ),
        utils.keccak256(utils.toUtf8Bytes(name)),
        utils.keccak256(utils.toUtf8Bytes('1')),
        31337,
        tokenAddress,
      ]
    )
  )
}

async function getApprovalDigest(
  token: Contract,
  approve: {
    owner: string
    spender: string
    value: BigNumber
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<string> {
  const name = await token.name()
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
  return utils.keccak256(
    utils.solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        utils.keccak256(
          utils.defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        ),
      ]
    )
  )
}

describe('DinoBEP20', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets();
    this.alice = this.wallets[0]
    this.minter = this.wallets[1]
    this.MockBEP20 = await ethers.getContractFactory('MockBEP20', this.minter)
  })

  beforeEach(async function () {
    this.token = await this.MockBEP20.deploy(TOTAL_SUPPLY)
    await this.token.deployed()
  })

  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async function () {
    const name = await this.token.name()
    expect(name).to.eq('Dino LPs')
    expect(await this.token.symbol()).to.eq('Dino-LP')
    expect(await this.token.decimals()).to.eq(18)
    expect(await this.token.totalSupply()).to.eq(TOTAL_SUPPLY)
    expect(await this.token.balanceOf(this.minter.address)).to.eq(TOTAL_SUPPLY)
    expect(await this.token.DOMAIN_SEPARATOR()).to.eq(
      utils.keccak256(
        utils.defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            utils.keccak256(
              utils.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
            ),
            utils.keccak256(utils.toUtf8Bytes(name)),
            utils.keccak256(utils.toUtf8Bytes('1')),
            31337,
            this.token.address,
          ]
        )
      )
    )
    expect(await this.token.PERMIT_TYPEHASH()).to.eq(
      utils.keccak256(
        utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
      )
    )
  })

  it('approve', async function () {
    await expect(this.token.approve(this.alice.address, TEST_AMOUNT))
      .to.emit(this.token, 'Approval')
      .withArgs(this.minter.address, this.alice.address, TEST_AMOUNT)
    expect(await this.token.allowance(this.minter.address, this.alice.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer', async function () {
    await expect(this.token.transfer(this.alice.address, TEST_AMOUNT))
      .to.emit(this.token, 'Transfer')
      .withArgs(this.minter.address, this.alice.address, TEST_AMOUNT)
    expect(await this.token.balanceOf(this.minter.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await this.token.balanceOf(this.alice.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer:fail', async function () {
    await expect(this.token.transfer(this.alice.address, TOTAL_SUPPLY.add(1))).to.be.reverted // ds-math-sub-underflow
    await expect(this.token.connect(this.alice).transfer(this.minter.address, 1)).to.be.reverted // ds-math-sub-underflow
  })

  it('transferFrom', async function () {
    await this.token.approve(this.alice.address, TEST_AMOUNT)
    await expect(this.token.connect(this.alice).transferFrom(this.minter.address, this.alice.address, TEST_AMOUNT))
      .to.emit(this.token, 'Transfer')
      .withArgs(this.minter.address, this.alice.address, TEST_AMOUNT)
    expect(await this.token.allowance(this.minter.address, this.alice.address)).to.eq(0)
    expect(await this.token.balanceOf(this.minter.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await this.token.balanceOf(this.alice.address)).to.eq(TEST_AMOUNT)
  })

  it('transferFrom:max', async function () {
    await this.token.approve(this.alice.address, ethers.constants.MaxUint256)
    await expect(this.token.connect(this.alice).transferFrom(this.minter.address, this.alice.address, TEST_AMOUNT))
      .to.emit(this.token, 'Transfer')
      .withArgs(this.minter.address, this.alice.address, TEST_AMOUNT)
    expect(await this.token.allowance(this.minter.address, this.alice.address)).to.eq(ethers.constants.MaxUint256)
    expect(await this.token.balanceOf(this.minter.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await this.token.balanceOf(this.alice.address)).to.eq(TEST_AMOUNT)
  })

  it('permit', async function () {
    const nonce = await this.token.nonces(this.minter.address)
    const deadline = ethers.constants.MaxUint256
    const digest = await getApprovalDigest(
      this.token,
      { owner: this.minter.address, spender: this.alice.address, value: TEST_AMOUNT },
      nonce,
      deadline
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(this.minter.privateKey.slice(2), 'hex'))

    await expect(
      this.token.permit(
        this.minter.address,
        this.alice.address,
        TEST_AMOUNT,
        deadline,
        v,
        utils.hexlify(r),
        utils.hexlify(s)
      )
    )
      .to.emit(this.token, 'Approval')
      .withArgs(this.minter.address, this.alice.address, TEST_AMOUNT)
    expect(await this.token.allowance(this.minter.address, this.alice.address)).to.eq(TEST_AMOUNT)
    expect(await this.token.nonces(this.minter.address)).to.eq(BigNumber.from(1))
  })
})
