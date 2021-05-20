// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.6.12;

import './interfaces/IBEP20.sol';
import './libraries/Ownable.sol';
import './libraries/SafeMath.sol';

contract DinoTreasury is Ownable {
    using SafeMath for uint256;

    uint256 public constant reductionInterval = 864_000; // ~30 days
    uint256 public constant reductionRate = 3; // 3%

    // Info of each fund.
    struct FundInfo {
        address recipient; // Address of recipient contract.
        uint256 allocPoint; // How many allocation points assigned to this fund.
        uint256 lastRewardBlock; // Last block number that DINOs distribution occurs.
        uint256 accReward; // Accumulated DINOs rewarded.
        uint256 usedReward; // Accumulated DINOs withdrawed.
    }

    // The DINO TOKEN!
    IBEP20 public dino;
    // Info of each fund.
    FundInfo[] public fundInfo;
    mapping(address => uint256) public recipientToPid;

    // Total allocation points. Must be the sum of all allocation points in all funds.
    uint256 public totalAllocPoint = 0;
    // The block number when DINO mining starts.
    uint256 public startBlock;

    constructor(IBEP20 _dino, uint256 _startBlock) public {
        dino = _dino;
        startBlock = _startBlock;
        fundInfo.push(
            FundInfo({recipient: address(0), allocPoint: 0, lastRewardBlock: 0, accReward: 0, usedReward: 0})
        );
    }

    // Add a new reward to the fund. Can only be called by the owner.
    function add(uint256 _allocPoint, address _recipient) public onlyOwner {
        require(recipientToPid[_recipient] == 0, 'fund exists');
        massUpdateFunds();
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        recipientToPid[_recipient] = fundInfo.length;
        fundInfo.push(
            FundInfo({
                recipient: _recipient,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accReward: 0,
                usedReward: 0
            })
        );
    }

    // Update the given fund's DINO allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint) public onlyOwner {
        massUpdateFunds();
        uint256 prevAllocPoint = fundInfo[_pid].allocPoint;
        fundInfo[_pid].allocPoint = _allocPoint;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(_allocPoint);
        }
    }

    function claim() external returns (uint256) {
        uint256 pid = recipientToPid[msg.sender];
        if (pid <= 0) return 0; // fund not found
        updateFund(pid);

        FundInfo storage fund = fundInfo[pid];
        if (fund.accReward > fund.usedReward) {
            uint256 amount = fund.accReward - fund.usedReward;
            uint256 dinoBal = dino.balanceOf(address(this));
            if (amount > dinoBal) amount = dinoBal;
            dino.transfer(msg.sender, amount);
            fund.usedReward = fund.usedReward.add(amount);
            return amount;
        }
        return 0;
    }

    // Update reward variables for all funds. Be careful of gas spending!
    function massUpdateFunds() internal {
        uint256 length = fundInfo.length;
        for (uint256 pid = 1; pid < length; ++pid) {
            updateFund(pid);
        }
    }

    // Update reward variables of the given fund to be up-to-date.
    function updateFund(uint256 _pid) internal {
        FundInfo storage fund = fundInfo[_pid];
        if (block.number <= fund.lastRewardBlock) {
            return;
        }

        uint256 dinoReward =
            getMultiplier(fund.lastRewardBlock, block.number).mul(fund.allocPoint).div(totalAllocPoint);
        fund.accReward = fund.accReward.add(dinoReward);
        fund.lastRewardBlock = block.number;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        uint256 multiplier = 0;
        uint256 nextRewardBlock = _from;
        uint256 nextReduction = nextReductionBlock(nextRewardBlock);
        uint256 blockCount = (_to > nextReduction ? nextReduction : _to) - nextRewardBlock;
        while (blockCount > 0) {
            uint256 rewardPerBlock = dinoRewardAtBlock(nextRewardBlock);
            multiplier = multiplier.add(blockCount.mul(rewardPerBlock));
            nextRewardBlock = (_to > nextReduction ? nextReduction : _to);
            nextReduction = nextReductionBlock(nextRewardBlock);
            blockCount = (_to > nextReduction ? nextReduction : _to) - nextRewardBlock;
        }
        return multiplier;
    }

    // Number of DINO tokens rewarded per block.
    function dinoRewardAtBlock(uint256 _blockNumber) public view returns (uint256) {
        if (_blockNumber < startBlock) return 0;
        uint256 reducedCount = _blockNumber.sub(startBlock).div(reductionInterval);
        uint256 dinoPerBlock = 6e18;
        for (uint256 i = 0; i < reducedCount; ++i) {
            dinoPerBlock = dinoPerBlock.mul(97).div(100);
        }
        return dinoPerBlock;
    }

    function nextReductionBlock(uint256 _blockNumber) public view returns (uint256) {
        if (_blockNumber < startBlock) return startBlock;
        return _blockNumber.add(reductionInterval.sub(_blockNumber.sub(startBlock).mod(reductionInterval)));
    }
}
