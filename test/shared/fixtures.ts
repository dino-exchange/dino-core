import { Contract, Wallet } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import BEP20 from '../../artifacts/contracts/test/MockBEP20.sol/BEP20.json'
import WBNB from '../../artifacts/contracts/test/MockWBNB.sol/WBNB.json'
import DinoFactory from '../../artifacts/contracts/DinoFactory.sol/DinoFactory.json'
import DinoPair from '../../artifacts/contracts/DinoPair.sol/DinoPair.json'
import DinoRouter from '../../artifacts/contracts/DinoRouter.sol/DinoRouter.json'

interface FactoryFixture {
  factory: Contract
}

const overrides = {
  gasLimit: 9999999,
}

export async function factoryFixture(_: Web3Provider, [wallet]: Wallet[]): Promise<FactoryFixture> {
  const factory = await deployContract(wallet, DinoFactory, [wallet.address], overrides)
  return { factory }
}

interface PairFixture extends FactoryFixture {
  token0: Contract
  token1: Contract
  pair: Contract
}

export async function pairFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<PairFixture> {
  const { factory } = await factoryFixture(provider, [wallet])

  const tokenA = await deployContract(wallet, BEP20, [expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, BEP20, [expandTo18Decimals(10000)], overrides)

  await factory.createPair(tokenA.address, tokenB.address, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(DinoPair.abi), provider).connect(wallet)

  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { factory, token0, token1, pair }
}

interface SwapFixture extends FactoryFixture {
  token0: Contract
  token1: Contract
  router: Contract
}

export async function swapFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<SwapFixture> {
  const { factory } = await factoryFixture(provider, [wallet])

  const tokenA = await deployContract(wallet, BEP20, [expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, BEP20, [expandTo18Decimals(10000)], overrides)
  const tokenWBNB = await deployContract(wallet, WBNB)
  const router = await deployContract(wallet, DinoRouter, [factory.address, tokenWBNB.address], overrides)

  await factory.createPair(tokenA.address, tokenB.address, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(DinoPair.abi), provider).connect(wallet)

  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { factory, token0, token1, router }
}
