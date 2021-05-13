import '@nomiclabs/hardhat-waffle';
import 'hardhat-deploy';

import { HardhatUserConfig, task } from 'hardhat/config';

const accounts = {
  mnemonic: process.env.MNEMONIC || 'glimpse half enlist grant search million apart ocean script amazing bachelor winner',
};

task('accounts', 'Prints the list of accounts', async (_args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: { default: 0 },
    dev: { default: 1 },
    mkt: { default: 2 },
    pool: { default: 3 },
    fee: { default: 4 },
  },
  networks: {
    localhost: {
      accounts,
      live: false,
      saveDeployments: true,
    },
    ganache: {
      chainId: 1337,
      url: 'http://127.0.0.1:7545',
      accounts,
      live: false,
      saveDeployments: true,
    },
    bsc: {
      chainId: 56,
      gasPrice: 7000000000,
      url: 'https://bsc-dataseed.binance.org',
      accounts,
      live: true,
      saveDeployments: true,
    },
    'bsc-testnet': {
      chainId: 97,
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      accounts,
      live: true,
      saveDeployments: true,
    },
  },
  solidity: {
    compilers: [{
      version: '0.5.16',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    }],
  },
};

export default config;
